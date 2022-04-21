"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Job = void 0;
const tslib_1 = require("tslib");
const util_1 = require("util");
const enums_1 = require("../enums");
const utils_1 = require("../utils");
const flow_producer_1 = require("./flow-producer");
const backoffs_1 = require("./backoffs");
const scripts_1 = require("./scripts");
const lodash_1 = require("lodash");
const logger = util_1.debuglog('bull');
class Job {
    constructor(queue, name, data, opts = {}, id) {
        this.queue = queue;
        this.name = name;
        this.data = data;
        this.opts = opts;
        this.id = id;
        /**
         * The progress a job has performed so far.
         */
        this.progress = 0;
        /**
         * The value returned by the processor when processing this job.
         */
        this.returnvalue = null;
        /**
         * Stacktrace for the error (for failed jobs).
         */
        this.stacktrace = null;
        /**
         * Number of attempts after the job has failed.
         */
        this.attemptsMade = 0;
        this.opts = Object.assign({
            attempts: 0,
            delay: 0,
        }, opts);
        this.timestamp = opts.timestamp ? opts.timestamp : Date.now();
        this.opts.backoff = backoffs_1.Backoffs.normalize(opts.backoff);
        this.parentKey = flow_producer_1.getParentKey(opts.parent);
        this.toKey = queue.toKey.bind(queue);
    }
    static async create(queue, name, data, opts) {
        const client = await queue.client;
        const job = new Job(queue, name, data, opts, opts && opts.jobId);
        job.id = await job.addJob(client, {
            parentKey: job.parentKey,
            parentDependenciesKey: job.parentKey
                ? `${job.parentKey}:dependencies`
                : '',
        });
        return job;
    }
    static async createBulk(queue, jobs) {
        const client = await queue.client;
        const jobInstances = jobs.map(job => { var _a; return new Job(queue, job.name, job.data, job.opts, (_a = job.opts) === null || _a === void 0 ? void 0 : _a.jobId); });
        const multi = client.multi();
        for (const job of jobInstances) {
            job.addJob(multi, {
                parentKey: job.parentKey,
                parentDependenciesKey: job.parentKey
                    ? `${job.parentKey}:dependencies`
                    : '',
            });
        }
        const result = (await multi.exec());
        result.forEach((res, index) => {
            const [err, id] = res;
            jobInstances[index].id = id;
        });
        return jobInstances;
    }
    static fromJSON(queue, json, jobId) {
        const data = JSON.parse(json.data || '{}');
        const opts = JSON.parse(json.opts || '{}');
        const job = new Job(queue, json.name, data, opts, json.id || jobId);
        job.progress = JSON.parse(json.progress || '0');
        // job.delay = parseInt(json.delay);
        job.timestamp = parseInt(json.timestamp);
        if (json.finishedOn) {
            job.finishedOn = parseInt(json.finishedOn);
        }
        if (json.processedOn) {
            job.processedOn = parseInt(json.processedOn);
        }
        job.failedReason = json.failedReason;
        job.attemptsMade = parseInt(json.attemptsMade || '0');
        job.stacktrace = getTraces(json.stacktrace);
        if (typeof json.returnvalue === 'string') {
            job.returnvalue = getReturnValue(json.returnvalue);
        }
        if (json.parentKey) {
            job.parentKey = json.parentKey;
        }
        return job;
    }
    static async fromId(queue, jobId) {
        // jobId can be undefined if moveJob returns undefined
        if (jobId) {
            const client = await queue.client;
            const jobData = await client.hgetall(queue.toKey(jobId));
            return utils_1.isEmpty(jobData)
                ? undefined
                : Job.fromJSON(queue, jobData, jobId);
        }
    }
    toJSON() {
        const _a = this, { queue } = _a, withoutQueue = tslib_1.__rest(_a, ["queue"]);
        return withoutQueue;
    }
    asJSON() {
        return {
            id: this.id,
            name: this.name,
            data: JSON.stringify(typeof this.data === 'undefined' ? {} : this.data),
            opts: JSON.stringify(this.opts),
            progress: this.progress,
            attemptsMade: this.attemptsMade,
            finishedOn: this.finishedOn,
            processedOn: this.processedOn,
            timestamp: this.timestamp,
            failedReason: JSON.stringify(this.failedReason),
            stacktrace: JSON.stringify(this.stacktrace),
            returnvalue: JSON.stringify(this.returnvalue),
        };
    }
    async update(data) {
        const client = await this.queue.client;
        this.data = data;
        await client.hset(this.queue.toKey(this.id), 'data', JSON.stringify(data));
    }
    async updateProgress(progress) {
        this.progress = progress;
        return scripts_1.Scripts.updateProgress(this.queue, this, progress);
    }
    /**
     * Logs one row of log data.
     *
     * @params logRow: string String with log data to be logged.
     *
     */
    async log(logRow) {
        const client = await this.queue.client;
        const logsKey = this.toKey(this.id) + ':logs';
        return client.rpush(logsKey, logRow);
    }
    async remove() {
        await this.queue.waitUntilReady();
        const queue = this.queue;
        const job = this;
        const removed = await scripts_1.Scripts.remove(queue, job.id);
        if (removed) {
            queue.emit('removed', job);
        }
        else {
            throw new Error('Could not remove job ' + job.id);
        }
    }
    /**
     * Extend the lock for this job.
     *
     * @param token unique token for the lock
     * @param duration lock duration in milliseconds
     */
    async extendLock(token, duration) {
        return scripts_1.Scripts.extendLock(this.queue, this.id, token, duration);
    }
    /**
     * Moves a job to the completed queue.
     * Returned job to be used with Queue.prototype.nextJobFromJobData.
     * @param returnValue {string} The jobs success message.
     * @param fetchNext {boolean} True when wanting to fetch the next job
     * @returns {Promise} Returns the jobData of the next job in the waiting queue.
     */
    async moveToCompleted(returnValue, token, fetchNext = true) {
        await this.queue.waitUntilReady();
        this.returnvalue = returnValue || void 0;
        const stringifiedReturnValue = utils_1.tryCatch(JSON.stringify, JSON, [
            returnValue,
        ]);
        if (stringifiedReturnValue === utils_1.errorObject) {
            throw utils_1.errorObject.value;
        }
        return scripts_1.Scripts.moveToCompleted(this.queue, this, stringifiedReturnValue, this.opts.removeOnComplete, token, fetchNext);
    }
    /**
     * Moves a job to the failed queue.
     * @param err {Error} The jobs error message.
     * @param token {string} Token to check job is locked by current worker
     * @param fetchNext {boolean} True when wanting to fetch the next job
     * @returns void
     */
    async moveToFailed(err, token, fetchNext = false) {
        const client = await this.queue.client;
        const queue = this.queue;
        this.failedReason = err.message;
        let command;
        const multi = client.multi();
        this.saveAttempt(multi, err);
        //
        // Check if an automatic retry should be performed
        //
        let moveToFailed = false;
        if (this.attemptsMade < this.opts.attempts && !this.discarded) {
            const opts = queue.opts;
            // Check if backoff is needed
            const delay = await backoffs_1.Backoffs.calculate(this.opts.backoff, this.attemptsMade, opts.settings && opts.settings.backoffStrategies, err, this);
            if (delay === -1) {
                moveToFailed = true;
            }
            else if (delay) {
                const args = scripts_1.Scripts.moveToDelayedArgs(queue, this.id, Date.now() + delay);
                multi.moveToDelayed(args);
                command = 'delayed';
            }
            else {
                // Retry immediately
                multi.retryJob(scripts_1.Scripts.retryJobArgs(queue, this));
                command = 'retry';
            }
        }
        else {
            // If not, move to failed
            moveToFailed = true;
        }
        if (moveToFailed) {
            const args = scripts_1.Scripts.moveToFailedArgs(queue, this, err.message, this.opts.removeOnFail, token, fetchNext);
            multi.moveToFinished(args);
            command = 'failed';
        }
        if (!this.queue.closing) {
            const results = await multi.exec();
            const code = results[results.length - 1][1];
            if (code < 0) {
                throw scripts_1.Scripts.finishedErrors(code, this.id, command);
            }
        }
    }
    isCompleted() {
        return this.isInZSet('completed');
    }
    isFailed() {
        return this.isInZSet('failed');
    }
    isDelayed() {
        return this.isInZSet('delayed');
    }
    isWaitingChildren() {
        return this.isInZSet('waiting-children');
    }
    isActive() {
        return this.isInList('active');
    }
    async isWaiting() {
        return (await this.isInList('wait')) || (await this.isInList('paused'));
    }
    /**
     * Get current state.
     * @method
     * @returns {string} Returns one of these values:
     * 'completed', 'failed', 'delayed', 'active', 'waiting', 'waiting-children', 'unknown'.
     */
    getState() {
        return scripts_1.Scripts.getState(this.queue, this.id);
    }
    /**
     * Get this jobs children result values if any.
     *
     * @returns Object mapping children job keys with their values.
     */
    async getChildrenValues() {
        const client = await this.queue.client;
        const result = (await client.hgetall(this.toKey(`${this.id}:processed`)));
        if (result) {
            return lodash_1.fromPairs(Object.entries(result).map(([k, v]) => [k, JSON.parse(v)]));
        }
    }
    /**
     * Get children job keys if this job is a parent and has children.
     *
     * @returns dependencies separated by processed and unprocessed.
     */
    async getDependencies() {
        const client = await this.queue.client;
        const multi = client.multi();
        await multi.hgetall(this.toKey(`${this.id}:processed`));
        await multi.smembers(this.toKey(`${this.id}:dependencies`));
        const [[err1, processed], [err2, unprocessed]] = (await multi.exec());
        return { processed, unprocessed };
    }
    /**
     * Returns a promise the resolves when the job has finished. (completed or failed).
     */
    async waitUntilFinished(queueEvents, ttl) {
        await this.queue.waitUntilReady();
        const jobId = this.id;
        return new Promise(async (resolve, reject) => {
            let timeout;
            if (ttl) {
                timeout = setTimeout(() => onFailed(
                /* eslint-disable max-len */
                `Job wait ${this.name} timed out before finishing, no finish notification arrived after ${ttl}ms (id=${jobId})`), ttl);
            }
            function onCompleted(args) {
                removeListeners();
                resolve(args.returnvalue);
            }
            function onFailed(args) {
                removeListeners();
                reject(new Error(args.failedReason || args));
            }
            const completedEvent = `completed:${jobId}`;
            const failedEvent = `failed:${jobId}`;
            queueEvents.on(completedEvent, onCompleted);
            queueEvents.on(failedEvent, onFailed);
            this.queue.on('closing', onFailed);
            const removeListeners = () => {
                clearInterval(timeout);
                queueEvents.removeListener(completedEvent, onCompleted);
                queueEvents.removeListener(failedEvent, onFailed);
                this.queue.removeListener('closing', onFailed);
            };
            // Poll once right now to see if the job has already finished. The job may have been completed before we were able
            // to register the event handlers on the QueueEvents, so we check here to make sure we're not waiting for an event
            // that has already happened. We block checking the job until the queue events object is actually listening to
            // Redis so there's no chance that it will miss events.
            await queueEvents.waitUntilReady();
            const status = await scripts_1.Scripts.isFinished(this.queue, jobId);
            const finished = status > 0;
            if (finished) {
                const job = await Job.fromId(this.queue, this.id);
                if (status == 2) {
                    onFailed(job);
                }
                else {
                    onCompleted(job);
                }
            }
        });
    }
    moveToDelayed(timestamp) {
        return scripts_1.Scripts.moveToDelayed(this.queue, this.id, timestamp);
    }
    async promote() {
        const queue = this.queue;
        const jobId = this.id;
        const result = await scripts_1.Scripts.promote(queue, jobId);
        if (result === -1) {
            throw new Error('Job ' + jobId + ' is not in a delayed state');
        }
    }
    /**
     * Attempts to retry the job. Only a job that has failed can be retried.
     *
     * @return {Promise} If resolved and return code is 1, then the queue emits a waiting event
     * otherwise the operation was not a success and throw the corresponding error. If the promise
     * rejects, it indicates that the script failed to execute
     */
    async retry(state = 'failed') {
        const client = await this.queue.client;
        this.failedReason = null;
        this.finishedOn = null;
        this.processedOn = null;
        await client.hdel(this.queue.toKey(this.id), 'finishedOn', 'processedOn', 'failedReason');
        const result = await scripts_1.Scripts.reprocessJob(this.queue, this, state);
        if (result === 1) {
            return;
        }
        else if (result === enums_1.RetryErrors.JobNotExist) {
            throw new Error('Retried job not exist');
        }
        else if (result === enums_1.RetryErrors.JobNotFailed) {
            throw new Error('Retried job not failed');
        }
    }
    discard() {
        this.discarded = true;
    }
    async isInZSet(set) {
        const client = await this.queue.client;
        const score = await client.zscore(this.queue.toKey(set), this.id);
        return score !== null;
    }
    async isInList(list) {
        return scripts_1.Scripts.isJobInList(this.queue, this.queue.toKey(list), this.id);
    }
    addJob(client, parentOpts) {
        const queue = this.queue;
        const jobData = this.asJSON();
        const exceedLimit = this.opts.sizeLimit &&
            utils_1.lengthInUtf8Bytes(jobData.data) > this.opts.sizeLimit;
        if (exceedLimit) {
            throw new Error(`The size of job ${this.name} exceeds the limit ${this.opts.sizeLimit} bytes`);
        }
        return scripts_1.Scripts.addJob(client, queue, jobData, this.opts, this.id, parentOpts);
    }
    saveAttempt(multi, err) {
        this.attemptsMade++;
        this.stacktrace = this.stacktrace || [];
        this.stacktrace.push(err.stack);
        if (this.opts.stackTraceLimit) {
            this.stacktrace = this.stacktrace.slice(0, this.opts.stackTraceLimit);
        }
        const params = {
            attemptsMade: this.attemptsMade,
            stacktrace: JSON.stringify(this.stacktrace),
            failedReason: err.message,
        };
        multi.hmset(this.queue.toKey(this.id), params);
    }
}
exports.Job = Job;
function getTraces(stacktrace) {
    const traces = utils_1.tryCatch(JSON.parse, JSON, [stacktrace]);
    if (traces === utils_1.errorObject || !(traces instanceof Array)) {
        return [];
    }
    else {
        return traces;
    }
}
function getReturnValue(_value) {
    const value = utils_1.tryCatch(JSON.parse, JSON, [_value]);
    if (value !== utils_1.errorObject) {
        return value;
    }
    else {
        logger('corrupted returnvalue: ' + _value, value);
    }
}
//# sourceMappingURL=job.js.map