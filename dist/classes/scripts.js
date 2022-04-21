/**
 * Includes all the scripts needed by the queue and jobs.
 */
/*eslint-env node */
'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
exports.Scripts = void 0;
const semver = require("semver");
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
    static addJob(client, queue, job, opts, jobId, parentOpts = {
        waitChildrenKey: null,
        parentDependenciesKey: null,
        parentKey: null,
    }) {
        const queueKeys = queue.keys;
        let keys = [
            queueKeys.wait,
            queueKeys.paused,
            queueKeys.meta,
            queueKeys.id,
            queueKeys.delayed,
            queueKeys.priority,
            queueKeys.events,
            queueKeys.delay,
        ];
        const args = [
            queueKeys[''],
            typeof jobId !== 'undefined' ? jobId : '',
            job.name,
            job.data,
            job.opts,
            job.timestamp,
            opts.delay,
            opts.delay ? job.timestamp + opts.delay : 0,
            opts.priority || 0,
            opts.lifo ? 'RPUSH' : 'LPUSH',
            parentOpts.parentKey,
            parentOpts.waitChildrenKey,
            parentOpts.parentDependenciesKey,
        ];
        keys = keys.concat(args);
        return client.addJob(keys);
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
    static async updateProgress(queue, job, progress) {
        const client = await queue.client;
        const keys = [queue.toKey(job.id), queue.keys.events];
        const progressJson = JSON.stringify(progress);
        await client.updateProgress(keys, [job.id, progressJson]);
        queue.emit('progress', job, progress);
    }
    static moveToFinishedArgs(queue, job, val, propVal, shouldRemove, target, token, fetchNext = true) {
        var _a, _b, _c, _d;
        const queueKeys = queue.keys;
        const opts = queue.opts;
        const keys = [
            queueKeys.active,
            queueKeys[target],
            queue.toKey(job.id),
            queueKeys.wait,
            queueKeys.priority,
            queueKeys.events,
            queueKeys.meta,
        ];
        let remove;
        if (typeof shouldRemove === 'boolean') {
            remove = shouldRemove ? '1' : '0';
        }
        else if (typeof shouldRemove === 'number') {
            remove = `${shouldRemove + 1}`;
        }
        const args = [
            job.id,
            Date.now(),
            propVal,
            typeof val === 'undefined' ? 'null' : val,
            target,
            remove,
            JSON.stringify({ jobId: job.id, val: val }),
            !fetchNext || queue.closing || opts.limiter ? 0 : 1,
            queueKeys[''],
            token,
            opts.lockDuration,
            (_b = (_a = job.opts) === null || _a === void 0 ? void 0 : _a.parent) === null || _b === void 0 ? void 0 : _b.id,
            (_d = (_c = job.opts) === null || _c === void 0 ? void 0 : _c.parent) === null || _d === void 0 ? void 0 : _d.queue,
        ];
        return keys.concat(args);
    }
    static async moveToFinished(queue, job, val, propVal, shouldRemove, target, token, fetchNext) {
        const client = await queue.client;
        const args = this.moveToFinishedArgs(queue, job, val, propVal, shouldRemove, target, token, fetchNext);
        const result = await client.moveToFinished(args);
        if (result < 0) {
            throw this.finishedErrors(result, job.id, 'finished');
        }
        else if (result) {
            return raw2jobData(result);
        }
    }
    static finishedErrors(code, jobId, command) {
        switch (code) {
            case -1:
                return new Error(`Missing key for job ${jobId} ${command}`);
            case -2:
                return new Error(`Missing lock for job ${jobId} ${command}`);
            case -3:
                return new Error(`Job is not in the active list ${jobId} ${command}`);
            case -4:
                return new Error(`Job ${jobId} has pending dependencies ${command}`);
        }
    }
    static moveToCompleted(queue, job, returnvalue, removeOnComplete, token, fetchNext) {
        return this.moveToFinished(queue, job, returnvalue, 'returnvalue', removeOnComplete, 'completed', token, fetchNext);
    }
    static moveToFailedArgs(queue, job, failedReason, removeOnFailed, token, fetchNext = false) {
        return this.moveToFinishedArgs(queue, job, failedReason, 'failedReason', removeOnFailed, 'failed', token, fetchNext);
    }
    static async isFinished(queue, jobId) {
        const client = await queue.client;
        const keys = ['completed', 'failed'].map(function (key) {
            return queue.toKey(key);
        });
        return client.isFinished(keys.concat([jobId]));
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
    static async moveToDelayed(queue, jobId, timestamp) {
        const client = await queue.client;
        const args = this.moveToDelayedArgs(queue, jobId, timestamp);
        const result = await client.moveToDelayed(args);
        if (result < 0) {
            throw this.finishedErrors(result, jobId, 'moveToDelayed');
        }
    }
    static async cleanJobsInSet(queue, set, timestamp, limit = 0) {
        const client = await queue.client;
        return client.cleanJobsInSet([
            queue.toKey(set),
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
    /**
     * Attempts to reprocess a job
     *
     * @param {Job} job
     * @param {Object} options
     * @param {String} options.state The expected job state. If the job is not found
     * on the provided state, then it's not reprocessed. Supported states: 'failed', 'completed'
     *
     * @return {Promise<Number>} Returns a promise that evaluates to a return code:
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
        const args = [job.id, (job.opts.lifo ? 'R' : 'L') + 'PUSH'];
        return client.reprocessJob(keys.concat(args));
    }
    static async moveToActive(worker, token, jobId) {
        const client = await worker.client;
        const opts = worker.opts;
        const queueKeys = worker.keys;
        const keys = [queueKeys.wait, queueKeys.active, queueKeys.priority];
        keys[3] = queueKeys.events;
        keys[4] = queueKeys.stalled;
        keys[5] = queueKeys.limiter;
        keys[6] = queueKeys.delayed;
        keys[7] = queueKeys.delay;
        const args = [
            queueKeys[''],
            token,
            opts.lockDuration,
            Date.now(),
            jobId,
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
    //
    //  It checks if the job in the top of the delay set should be moved back to the
    //  top of the  wait queue (so that it will be processed as soon as possible)
    //
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
    //
    // Looks for unlocked jobs in the active queue.
    //
    //    The job was being worked on, but the worker process died and it failed to renew the lock.
    //    We call these jobs 'stalled'. This is the most common case. We resolve these by moving them
    //    back to wait to be re-processed. To prevent jobs from cycling endlessly between active and wait,
    //    (e.g. if the job handler keeps crashing),
    //    we limit the number stalled job recoveries to settings.maxStalledCount.
    //
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
    if (raw) {
        const jobData = raw[0];
        if (jobData.length) {
            const job = utils_1.array2obj(jobData);
            return [job, raw[1]];
        }
    }
    return [];
}
//# sourceMappingURL=scripts.js.map