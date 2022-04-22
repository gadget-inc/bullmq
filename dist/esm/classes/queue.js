import { get } from 'lodash';
import { v4 } from 'uuid';
import { isRedisInstance, jobIdForGroup } from '../utils';
import { Job } from './job';
import { QueueGetters } from './queue-getters';
import { Repeat } from './repeat';
import { Scripts } from './scripts';
/**
 * Queue
 *
 * This class provides methods to add jobs to a queue and some othe high-level
 * administration such as pausing or deleting queues.
 *
 */
export class Queue extends QueueGetters {
    constructor(name, opts, Connection) {
        super(name, Object.assign({ sharedConnection: isRedisInstance(opts === null || opts === void 0 ? void 0 : opts.connection) }, opts), Connection);
        this.token = v4();
        this.limiter = null;
        this.jobsOpts = get(opts, 'defaultJobOptions');
        this.limiter = get(opts, 'limiter');
        this.waitUntilReady()
            .then(client => {
            if (!this.closing) {
                client.hset(this.keys.meta, 'opts.maxLenEvents', get(opts, 'streams.events.maxLen', 10000));
            }
        })
            .catch(err => {
            // We ignore this error to avoid warnings. The error can still
            // be received by listening to event 'error'
        });
    }
    /**
     * Returns this instance current default job options.
     */
    get defaultJobOptions() {
        return this.jobsOpts;
    }
    get repeat() {
        return new Promise(async (resolve) => {
            if (!this._repeat) {
                this._repeat = new Repeat(this.name, Object.assign(Object.assign({}, this.opts), { connection: await this.client }));
                this._repeat.on('error', e => this.emit.bind(this, e));
            }
            resolve(this._repeat);
        });
    }
    /**
     * Adds a new job to the queue.
     *
     * @param name - Name of the job to be added to the queue,.
     * @param data - Arbitrary data to append to the job.
     * @param opts - Job options that affects how the job is going to be processed.
     */
    async add(name, data, opts) {
        if (opts && opts.repeat) {
            return (await this.repeat).addNextRepeatableJob(name, data, Object.assign(Object.assign({}, this.jobsOpts), opts), true);
        }
        else {
            const jobId = jobIdForGroup(opts, data, { limiter: this.limiter });
            const job = await Job.create(this, name, data, Object.assign(Object.assign(Object.assign({}, this.jobsOpts), opts), { jobId }));
            this.emit('waiting', job);
            return job;
        }
    }
    /**
     * Adds an array of jobs to the queue.
     *
     * @param jobs - The array of jobs to add to the queue. Each job is defined by 3
     * properties, 'name', 'data' and 'opts'. They follow the same signature as 'Queue.add'.
     */
    async addBulk(jobs) {
        return Job.createBulk(this, jobs.map(job => ({
            name: job.name,
            data: job.data,
            opts: Object.assign(Object.assign(Object.assign({}, this.jobsOpts), job.opts), { jobId: jobIdForGroup(job.opts, job.data, { limiter: this.limiter }) }),
        })));
    }
    /**
     * Pauses the processing of this queue globally.
     *
     * We use an atomic RENAME operation on the wait queue. Since
     * we have blocking calls with BRPOPLPUSH on the wait queue, as long as the queue
     * is renamed to 'paused', no new jobs will be processed (the current ones
     * will run until finalized).
     *
     * Adding jobs requires a LUA script to check first if the paused list exist
     * and in that case it will add it there instead of the wait list.
     */
    async pause() {
        await Scripts.pause(this, true);
        this.emit('paused');
    }
    /**
     * Resumes the processing of this queue globally.
     *
     * The method reverses the pause operation by resuming the processing of the
     * queue.
     */
    async resume() {
        await Scripts.pause(this, false);
        this.emit('resumed');
    }
    /**
     * Returns true if the queue is currently paused.
     */
    async isPaused() {
        const client = await this.client;
        const pausedKeyExists = await client.hexists(this.keys.meta, 'paused');
        return pausedKeyExists === 1;
    }
    /**
     * Get all repeatable meta jobs.
     *
     * @param start - Offset of first job to return.
     * @param end - Offset of last job to return.
     * @param asc - Determine the order in which jobs are returned based on their
     * next execution time.
     */
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
     * @param jobId - The id of the job to remove
     * @returns 1 if it managed to remove the job or 0 if the job or
     * any of its dependencies was locked.
     */
    async remove(jobId) {
        return Scripts.remove(this, jobId);
    }
    /**
     * Drains the queue, i.e., removes all jobs that are waiting
     * or delayed, but not active, completed or failed.
     *
     * @param delayed - Pass true if it should also clean the
     * delayed jobs.
     */
    drain(delayed = false) {
        return Scripts.drain(this, delayed);
    }
    /**
     * Cleans jobs from a queue. Similar to drain but keeps jobs within a certain
     * grace period.
     *
     * @param grace - The grace period
     * @param The - Max number of jobs to clean
     * @param {string} [type=completed] - The type of job to clean
     * Possible values are completed, wait, active, paused, delayed, failed. Defaults to completed.
     * @returns Id jobs from the deleted records
     */
    async clean(grace, limit, type = 'completed') {
        const jobs = await Scripts.cleanJobsInSet(this, type, Date.now() - grace, limit);
        this.emit('cleaned', jobs, type);
        return jobs;
    }
    /**
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
            cursor = await Scripts.obliterate(this, Object.assign({ force: false, count: 1000 }, opts));
        } while (cursor);
    }
    /**
     * Trim the event stream to an approximately maxLength.
     *
     * @param maxLength -
     */
    async trimEvents(maxLength) {
        const client = await this.client;
        return client.xtrim(this.keys.events, 'MAXLEN', '~', maxLength);
    }
}
//# sourceMappingURL=queue.js.map