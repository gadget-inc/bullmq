/**
 * Includes all the scripts needed by the queue and jobs.
 */
/*eslint-env node */
'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
exports.raw2jobData = exports.Scripts = void 0;
const msgpackr_1 = require("msgpackr");
const packer = new msgpackr_1.Packr({
    useRecords: false,
    encodeUndefinedAsNil: true,
});
const pack = packer.pack;
const semver = require("semver");
const enums_1 = require("../enums");
const utils_1 = require("../utils");
class Scripts {
    static async isJobInList(queue, listKey, jobId) {
        const client = await queue.client;
        let result;
        if (semver.lt(queue.redisVersion, '6.0.6')) {
            result = await client.isJobInList([listKey, jobId]);
        }
        else {
            result = await client.lpos(listKey, jobId);
        }
        return Number.isInteger(result);
    }
    static async addJob(client, queue, job, opts, jobId, parentOpts = {
        parentKey: null,
        waitChildrenKey: null,
        parentDependenciesKey: null,
    }) {
        const queueKeys = queue.keys;
        const keys = [
            queueKeys.wait,
            queueKeys.paused,
            queueKeys.meta,
            queueKeys.id,
            queueKeys.delayed,
            queueKeys.priority,
            queueKeys.completed,
            queueKeys.events,
            queueKeys.delay,
        ];
        const args = [
            queueKeys[''],
            typeof jobId !== 'undefined' ? jobId : '',
            job.name,
            job.timestamp,
            parentOpts.parentKey || null,
            parentOpts.waitChildrenKey || null,
            parentOpts.parentDependenciesKey || null,
        ];
        let encodedOpts;
        if (opts.repeat) {
            const repeat = Object.assign({}, opts.repeat);
            if (repeat.startDate) {
                repeat.startDate = +new Date(repeat.startDate);
            }
            if (repeat.endDate) {
                repeat.endDate = +new Date(repeat.endDate);
            }
            encodedOpts = pack(Object.assign(Object.assign({}, opts), { repeat }));
        }
        else {
            encodedOpts = pack(opts);
        }
        keys.push(pack(args), job.data, encodedOpts);
        const result = await client.addJob(keys);
        if (result < 0) {
            throw this.finishedErrors(result, parentOpts.parentKey, 'addJob');
        }
        return result;
    }
    static async pause(queue, pause) {
        const client = await queue.client;
        let src = 'wait', dst = 'paused';
        if (!pause) {
            src = 'paused';
            dst = 'wait';
        }
        const keys = [src, dst, 'meta'].map((name) => queue.toKey(name));
        keys.push(queue.keys.events);
        return client.pause(keys.concat([pause ? 'paused' : 'resumed']));
    }
    static removeRepeatableArgs(queue, repeatJobId, repeatJobKey) {
        const queueKeys = queue.keys;
        const keys = [queueKeys.repeat, queueKeys.delayed];
        const args = [repeatJobId, repeatJobKey, queueKeys['']];
        return keys.concat(args);
    }
    static async removeRepeatable(queue, repeatJobId, repeatJobKey) {
        const client = await queue.client;
        const args = this.removeRepeatableArgs(queue, repeatJobId, repeatJobKey);
        return client.removeRepeatable(args);
    }
    static async remove(queue, jobId) {
        const client = await queue.client;
        const keys = [jobId].map(name => queue.toKey(name));
        return client.removeJob(keys.concat([jobId]));
    }
    static async extendLock(queue, jobId, token, duration) {
        const client = await queue.client;
        const args = [
            queue.toKey(jobId) + ':lock',
            queue.keys.stalled,
            token,
            duration,
            jobId,
        ];
        return client.extendLock(args);
    }
    static async updateData(queue, job, data) {
        const client = await queue.client;
        const keys = [queue.toKey(job.id)];
        const dataJson = JSON.stringify(data);
        const result = await client.updateData(keys.concat([dataJson]));
        if (result < 0) {
            throw this.finishedErrors(result, job.id, 'updateData');
        }
    }
    static async updateProgress(queue, job, progress) {
        const client = await queue.client;
        const keys = [queue.toKey(job.id), queue.keys.events];
        const progressJson = JSON.stringify(progress);
        const result = await client.updateProgress(keys.concat([job.id, progressJson]));
        if (result < 0) {
            throw this.finishedErrors(result, job.id, 'updateProgress');
        }
        queue.emit('progress', job, progress);
    }
    static moveToFinishedArgs(queue, job, val, propVal, shouldRemove, target, token, fetchNext = true) {
        var _a, _b, _c;
        const queueKeys = queue.keys;
        const opts = queue.opts;
        const metricsKey = queue.toKey(`metrics:${target}`);
        const keys = [
            queueKeys.wait,
            queueKeys.active,
            queueKeys.priority,
            queueKeys.events,
            queueKeys.stalled,
            queueKeys.limiter,
            queueKeys.delayed,
            queueKeys.delay,
            queueKeys[target],
            queue.toKey(job.id),
            queueKeys.meta,
            metricsKey,
        ];
        const keepJobs = typeof shouldRemove === 'object'
            ? shouldRemove
            : typeof shouldRemove === 'number'
                ? { count: shouldRemove }
                : { count: shouldRemove ? 0 : -1 };
        const args = [
            job.id,
            Date.now(),
            propVal,
            typeof val === 'undefined' ? 'null' : val,
            target,
            JSON.stringify({ jobId: job.id, val: val }),
            !fetchNext || queue.closing ? 0 : 1,
            queueKeys[''],
            pack({
                token,
                keepJobs,
                limiter: opts.limiter,
                lockDuration: opts.lockDuration,
                parent: (_a = job.opts) === null || _a === void 0 ? void 0 : _a.parent,
                parentKey: job.parentKey,
                attempts: job.opts.attempts,
                attemptsMade: job.attemptsMade,
                maxMetricsSize: ((_b = opts.metrics) === null || _b === void 0 ? void 0 : _b.maxDataPoints) ? (_c = opts.metrics) === null || _c === void 0 ? void 0 : _c.maxDataPoints : '',
            }),
        ];
        return keys.concat(args);
    }
    static async moveToFinished(queue, job, val, propVal, shouldRemove, target, token, fetchNext) {
        const client = await queue.client;
        const args = this.moveToFinishedArgs(queue, job, val, propVal, shouldRemove, target, token, fetchNext);
        const result = await client.moveToFinished(args);
        if (result < 0) {
            throw this.finishedErrors(result, job.id, 'finished', 'active');
        }
        else if (result) {
            return raw2jobData(result);
        }
    }
    static finishedErrors(code, jobId, command, state) {
        switch (code) {
            case enums_1.ErrorCode.JobNotExist:
                return new Error(`Missing key for job ${jobId}. ${command}`);
            case enums_1.ErrorCode.JobLockNotExist:
                return new Error(`Missing lock for job ${jobId}. ${command}`);
            case enums_1.ErrorCode.JobNotInState:
                return new Error(`Job ${jobId} is not in the ${state} state. ${command}`);
            case enums_1.ErrorCode.JobPendingDependencies:
                return new Error(`Job ${jobId} has pending dependencies. ${command}`);
            case enums_1.ErrorCode.ParentJobNotExist:
                return new Error(`Missing key for parent job ${jobId}. ${command}`);
        }
    }
    static drainArgs(queue, delayed) {
        const queueKeys = queue.keys;
        const keys = [
            queueKeys.wait,
            queueKeys.paused,
            delayed ? queueKeys.delayed : '',
            queueKeys.priority,
        ];
        const args = [queueKeys['']];
        return keys.concat(args);
    }
    static async drain(queue, delayed) {
        const client = await queue.client;
        const args = this.drainArgs(queue, delayed);
        return client.drain(args);
    }
    static moveToCompleted(queue, job, returnvalue, removeOnComplete, token, fetchNext) {
        return this.moveToFinished(queue, job, returnvalue, 'returnvalue', removeOnComplete, 'completed', token, fetchNext);
    }
    static moveToFailedArgs(queue, job, failedReason, removeOnFailed, token, fetchNext = false) {
        return this.moveToFinishedArgs(queue, job, failedReason, 'failedReason', removeOnFailed, 'failed', token, fetchNext);
    }
    static async isFinished(queue, jobId, returnValue = false) {
        const client = await queue.client;
        const keys = ['completed', 'failed', jobId].map(function (key) {
            return queue.toKey(key);
        });
        return client.isFinished(keys.concat([jobId, returnValue ? '1' : '']));
    }
    static async getState(queue, jobId) {
        const client = await queue.client;
        const keys = [
            'completed',
            'failed',
            'delayed',
            'active',
            'wait',
            'paused',
            'waiting-children',
        ].map(function (key) {
            return queue.toKey(key);
        });
        if (semver.lt(queue.redisVersion, '6.0.6')) {
            return client.getState(keys.concat([jobId]));
        }
        return client.getStateV2(keys.concat([jobId]));
    }
    static async changeDelay(queue, jobId, delay) {
        const client = await queue.client;
        const delayTimestamp = Date.now() + delay;
        const args = this.changeDelayArgs(queue, jobId, delayTimestamp);
        const result = await client.changeDelay(args);
        if (result < 0) {
            throw this.finishedErrors(result, jobId, 'changeDelay', 'delayed');
        }
    }
    static changeDelayArgs(queue, jobId, timestamp) {
        //
        // Bake in the job id first 12 bits into the timestamp
        // to guarantee correct execution order of delayed jobs
        // (up to 4096 jobs per given timestamp or 4096 jobs apart per timestamp)
        //
        // WARNING: Jobs that are so far apart that they wrap around will cause FIFO to fail
        //
        timestamp = Math.max(0, timestamp);
        if (timestamp > 0) {
            timestamp = timestamp * 0x1000 + (+jobId & 0xfff);
        }
        const keys = ['delayed', jobId].map(function (name) {
            return queue.toKey(name);
        });
        keys.push.apply(keys, [queue.keys.events, queue.keys.delay]);
        return keys.concat([JSON.stringify(timestamp), jobId]);
    }
    // Note: We have an issue here with jobs using custom job ids
    static moveToDelayedArgs(queue, jobId, timestamp) {
        //
        // Bake in the job id first 12 bits into the timestamp
        // to guarantee correct execution order of delayed jobs
        // (up to 4096 jobs per given timestamp or 4096 jobs apart per timestamp)
        //
        // WARNING: Jobs that are so far apart that they wrap around will cause FIFO to fail
        //
        timestamp = Math.max(0, timestamp !== null && timestamp !== void 0 ? timestamp : 0);
        if (timestamp > 0) {
            timestamp = timestamp * 0x1000 + (+jobId & 0xfff);
        }
        const keys = ['active', 'delayed', jobId].map(function (name) {
            return queue.toKey(name);
        });
        keys.push.apply(keys, [queue.keys.events, queue.keys.delay]);
        return keys.concat([JSON.stringify(timestamp), jobId]);
    }
    static moveToWaitingChildrenArgs(queue, jobId, token, opts) {
        var _a;
        let timestamp = Math.max(0, (_a = opts.timestamp) !== null && _a !== void 0 ? _a : 0);
        const childKey = utils_1.getParentKey(opts.child);
        if (timestamp > 0) {
            timestamp = timestamp * 0x1000 + (+jobId & 0xfff);
        }
        const keys = [`${jobId}:lock`, 'active', 'waiting-children', jobId].map(function (name) {
            return queue.toKey(name);
        });
        return keys.concat([
            token,
            childKey !== null && childKey !== void 0 ? childKey : '',
            JSON.stringify(timestamp),
            jobId,
        ]);
    }
    static async moveToDelayed(queue, jobId, timestamp) {
        const client = await queue.client;
        const args = this.moveToDelayedArgs(queue, jobId, timestamp);
        const result = await client.moveToDelayed(args);
        if (result < 0) {
            throw this.finishedErrors(result, jobId, 'moveToDelayed', 'active');
        }
    }
    /**
     * Move parent job to waiting-children state.
     *
     * @returns true if job is successfully moved, false if there are pending dependencies.
     * @throws JobNotExist
     * This exception is thrown if jobId is missing.
     * @throws JobLockNotExist
     * This exception is thrown if job lock is missing.
     * @throws JobNotInState
     * This exception is thrown if job is not in active state.
     */
    static async moveToWaitingChildren(queue, jobId, token, opts = {}) {
        const client = await queue.client;
        const multi = client.multi();
        const args = this.moveToWaitingChildrenArgs(queue, jobId, token, opts);
        multi.moveToWaitingChildren(args);
        const [[err, result]] = (await multi.exec());
        switch (result) {
            case 0:
                return true;
            case 1:
                return false;
            default:
                throw this.finishedErrors(result, jobId, 'moveToWaitingChildren', 'active');
        }
    }
    /**
     * Remove jobs in a specific state.
     *
     * @returns Id jobs from the deleted records.
     */
    static async cleanJobsInSet(queue, set, timestamp, limit = 0) {
        const client = await queue.client;
        return client.cleanJobsInSet([
            queue.toKey(set),
            queue.toKey('events'),
            queue.toKey(''),
            timestamp,
            limit,
            set,
        ]);
    }
    static retryJobArgs(queue, job) {
        const jobId = job.id;
        const keys = ['active', 'wait', jobId].map(function (name) {
            return queue.toKey(name);
        });
        keys.push(queue.keys.events);
        const pushCmd = (job.opts.lifo ? 'R' : 'L') + 'PUSH';
        return keys.concat([pushCmd, jobId]);
    }
    static retryJobsArgs(queue, state, count, timestamp) {
        const keys = [
            queue.toKey(''),
            queue.keys.events,
            queue.toKey(state),
            queue.toKey('wait'),
        ];
        const args = [count, timestamp];
        return keys.concat(args);
    }
    static async retryJobs(queue, state = 'failed', count = 1000, timestamp = new Date().getTime()) {
        const client = await queue.client;
        const args = this.retryJobsArgs(queue, state, count, timestamp);
        return client.retryJobs(args);
    }
    /**
     * Attempts to reprocess a job
     *
     * @param queue -
     * @param job -
     * @param state - The expected job state. If the job is not found
     * on the provided state, then it's not reprocessed. Supported states: 'failed', 'completed'
     *
     * @returns Returns a promise that evaluates to a return code:
     * 1 means the operation was a success
     * 0 means the job does not exist
     * -1 means the job is currently locked and can't be retried.
     * -2 means the job was not found in the expected set
     */
    static async reprocessJob(queue, job, state) {
        const client = await queue.client;
        const keys = [
            queue.toKey(job.id),
            queue.keys.events,
            queue.toKey(state),
            queue.toKey('wait'),
        ];
        const args = [
            job.id,
            (job.opts.lifo ? 'R' : 'L') + 'PUSH',
            state === 'failed' ? 'failedReason' : 'returnvalue',
        ];
        const result = await client.reprocessJob(keys.concat(args));
        switch (result) {
            case 1:
                return;
            default:
                throw this.finishedErrors(result, job.id, 'reprocessJob', state);
        }
    }
    static async moveToActive(worker, token, jobId) {
        const client = await worker.client;
        const opts = worker.opts;
        const queueKeys = worker.keys;
        const keys = [
            queueKeys.wait,
            queueKeys.active,
            queueKeys.priority,
            queueKeys.events,
            queueKeys.stalled,
            queueKeys.limiter,
            queueKeys.delayed,
            queueKeys.delay,
        ];
        const args = [
            queueKeys[''],
            Date.now(),
            jobId,
            pack({
                token,
                lockDuration: opts.lockDuration,
                limiter: opts.limiter,
            }),
        ];
        if (opts.limiter) {
            args.push(opts.limiter.max, opts.limiter.duration);
            opts.limiter.groupKey && args.push(true);
        }
        const result = await client.moveToActive(keys.concat(args));
        if (typeof result === 'number') {
            return [result, void 0];
        }
        return raw2jobData(result);
    }
    /**
     * It checks if the job in the top of the delay set should be moved back to the
     * top of the  wait queue (so that it will be processed as soon as possible)
     */
    static async updateDelaySet(queue, delayedTimestamp) {
        const client = await queue.client;
        const keys = [
            queue.keys.delayed,
            queue.keys.wait,
            queue.keys.priority,
            queue.keys.paused,
            queue.keys.meta,
            queue.keys.events,
            queue.keys.delay,
        ];
        const args = [queue.toKey(''), delayedTimestamp];
        return client.updateDelaySet(keys.concat(args));
    }
    static async promote(queue, jobId) {
        const client = await queue.client;
        const keys = [
            queue.keys.delayed,
            queue.keys.wait,
            queue.keys.paused,
            queue.keys.priority,
            queue.keys.events,
        ];
        const args = [queue.toKey(''), jobId];
        return client.promote(keys.concat(args));
    }
    /**
     * Looks for unlocked jobs in the active queue.
     *
     * The job was being worked on, but the worker process died and it failed to renew the lock.
     * We call these jobs 'stalled'. This is the most common case. We resolve these by moving them
     * back to wait to be re-processed. To prevent jobs from cycling endlessly between active and wait,
     * (e.g. if the job handler keeps crashing),
     * we limit the number stalled job recoveries to settings.maxStalledCount.
     */
    static async moveStalledJobsToWait(queue) {
        const client = await queue.client;
        const opts = queue.opts;
        const keys = [
            queue.keys.stalled,
            queue.keys.wait,
            queue.keys.active,
            queue.keys.failed,
            queue.keys['stalled-check'],
            queue.keys.meta,
            queue.keys.paused,
            queue.keys.events,
        ];
        const args = [
            opts.maxStalledCount,
            queue.toKey(''),
            Date.now(),
            opts.stalledInterval,
        ];
        return client.moveStalledJobsToWait(keys.concat(args));
    }
    static async obliterate(queue, opts) {
        const client = await queue.client;
        const keys = [queue.keys.meta, queue.toKey('')];
        const args = [opts.count, opts.force ? 'force' : null];
        const result = await client.obliterate(keys.concat(args));
        if (result < 0) {
            switch (result) {
                case -1:
                    throw new Error('Cannot obliterate non-paused queue');
                case -2:
                    throw new Error('Cannot obliterate queue with active jobs');
            }
        }
        return result;
    }
}
exports.Scripts = Scripts;
function raw2jobData(raw) {
    if (typeof raw === 'number') {
        return [raw, void 0];
    }
    if (raw) {
        const jobData = raw[0];
        if (jobData.length) {
            const job = utils_1.array2obj(jobData);
            return [job, raw[1]];
        }
    }
    return [];
}
exports.raw2jobData = raw2jobData;
//# sourceMappingURL=scripts.js.map