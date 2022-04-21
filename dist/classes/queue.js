"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Queue = void 0;
const lodash_1 = require("lodash");
const uuid_1 = require("uuid");
const repeat_1 = require("./repeat");
const queue_getters_1 = require("./queue-getters");
const job_1 = require("./job");
const scripts_1 = require("./scripts");
class Queue extends queue_getters_1.QueueGetters {
    constructor(name, opts) {
        super(name, opts);
        this.token = uuid_1.v4();
        this.limiter = null;
        this.jobsOpts = lodash_1.get(opts, 'defaultJobOptions');
        this.limiter = lodash_1.get(opts, 'limiter');
        // tslint:disable: no-floating-promises
        this.waitUntilReady().then(client => {
            client.hset(this.keys.meta, 'opts.maxLenEvents', lodash_1.get(opts, 'streams.events.maxLen', 10000));
        });
    }
    get defaultJobOptions() {
        return this.jobsOpts;
    }
    get repeat() {
        return new Promise(async (resolve) => {
            if (!this._repeat) {
                this._repeat = new repeat_1.Repeat(this.name, Object.assign(Object.assign({}, this.opts), { connection: await this.client }));
                this._repeat.on('error', e => this.emit.bind(this, e));
            }
            resolve(this._repeat);
        });
    }
    async add(name, data, opts) {
        if (opts && opts.repeat) {
            return (await this.repeat).addNextRepeatableJob(name, data, Object.assign(Object.assign({}, this.jobsOpts), opts), true);
        }
        else {
            const jobId = this.jobIdForGroup(opts, data);
            const job = await job_1.Job.create(this, name, data, Object.assign(Object.assign(Object.assign({}, this.jobsOpts), opts), { jobId }));
            this.emit('waiting', job);
            return job;
        }
    }
    jobIdForGroup(opts, data) {
        const jobId = opts && opts.jobId;
        const groupKey = lodash_1.get(this, 'limiter.groupKey');
        if (groupKey) {
            return `${jobId || uuid_1.v4()}:${lodash_1.get(data, groupKey)}`;
        }
        return jobId;
    }
    /**
     * Adds an array of jobs to the queue.
     * @method add
     * @param jobs: [] The array of jobs to add to the queue. Each job is defined by 3
     * properties, 'name', 'data' and 'opts'. They follow the same signature as 'Queue.add'.
     */
    async addBulk(jobs) {
        return job_1.Job.createBulk(this, jobs.map(job => ({
            name: job.name,
            data: job.data,
            opts: Object.assign(Object.assign(Object.assign({}, this.jobsOpts), job.opts), { jobId: this.jobIdForGroup(job.opts, job.data) }),
        })));
    }
    /**
      Pauses the processing of this queue globally.
  
      We use an atomic RENAME operation on the wait queue. Since
      we have blocking calls with BRPOPLPUSH on the wait queue, as long as the queue
      is renamed to 'paused', no new jobs will be processed (the current ones
      will run until finalized).
  
      Adding jobs requires a LUA script to check first if the paused list exist
      and in that case it will add it there instead of the wait list.
    */
    async pause() {
        await scripts_1.Scripts.pause(this, true);
        this.emit('paused');
    }
    async resume() {
        await scripts_1.Scripts.pause(this, false);
        this.emit('resumed');
    }
    async isPaused() {
        const client = await this.client;
        const pausedKeyExists = await client.hexists(this.keys.meta, 'paused');
        return pausedKeyExists === 1;
    }
    async getRepeatableJobs(start, end, asc) {
        return (await this.repeat).getRepeatableJobs(start, end, asc);
    }
    async removeRepeatable(name, repeatOpts, jobId) {
        return (await this.repeat).removeRepeatable(name, repeatOpts, jobId);
    }
    async removeRepeatableByKey(key) {
        return (await this.repeat).removeRepeatableByKey(key);
    }
    /**
     * Removes the given job from the queue as well as all its
     * dependencies.
     *
     * @param jobId The if of the job to remove
     * @returns 1 if it managed to remove the job or -1 if the job or
     * any of its dependencies was locked.
     */
    async remove(jobId) {
        return scripts_1.Scripts.remove(this, jobId);
    }
    /**
     * Drains the queue, i.e., removes all jobs that are waiting
     * or delayed, but not active, completed or failed.
     *
     * TODO: Convert to an atomic LUA script.
     */
    async drain(delayed = false) {
        // Get all jobids and empty all lists atomically.
        const client = await this.client;
        let multi = client.multi();
        multi.lrange(this.toKey('wait'), 0, -1);
        multi.lrange(this.toKey('paused'), 0, -1);
        if (delayed) {
            // TODO: get delayed jobIds too!
            multi.del(this.toKey('delayed'));
        }
        multi.del(this.toKey('wait'));
        multi.del(this.toKey('paused'));
        multi.del(this.toKey('priority'));
        const [waiting, paused] = await multi.exec();
        const waitingjobs = waiting[1];
        const pausedJobs = paused[1];
        const jobKeys = pausedJobs.concat(waitingjobs).map(this.toKey, this);
        if (jobKeys.length) {
            multi = client.multi();
            multi.del(...jobKeys);
            return multi.exec();
        }
    }
    /**
     * @method clean
     *
     * Cleans jobs from a queue. Similar to drain but keeps jobs within a certain
     * grace period.
     *
     * @param {number} grace - The grace period
     * @param {number} The max number of jobs to clean
     * @param {string} [type=completed] - The type of job to clean
     * Possible values are completed, wait, active, paused, delayed, failed. Defaults to completed.
     */
    async clean(grace, limit, type = 'completed') {
        const jobs = await scripts_1.Scripts.cleanJobsInSet(this, type, Date.now() - grace, limit);
        this.emit('cleaned', jobs, type);
        return jobs;
    }
    /**
     * @method obliterate
     *
     * Completely destroys the queue and all of its contents irreversibly.
     * This method will the *pause* the queue and requires that there are no
     * active jobs. It is possible to bypass this requirement, i.e. not
     * having active jobs using the "force" option.
     *
     * Note: This operation requires to iterate on all the jobs stored in the queue
     * and can be slow for very large queues.
     *
     * @param { { force: boolean, count: number }} opts. Use force = true to force obliteration even
     * with active jobs in the queue. Use count with the maximum number of deleted keys per iteration,
     * 1000 is the default.
     */
    async obliterate(opts) {
        await this.pause();
        let cursor = 0;
        do {
            cursor = await scripts_1.Scripts.obliterate(this, Object.assign({ force: false, count: 1000 }, opts));
        } while (cursor);
    }
    async trimEvents(maxLength) {
        const client = await this.client;
        return client.xtrim(this.keys.events, 'MAXLEN', '~', maxLength);
    }
}
exports.Queue = Queue;
//# sourceMappingURL=queue.js.map