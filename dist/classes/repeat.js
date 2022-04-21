"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Repeat = void 0;
const crypto_1 = require("crypto");
const queue_base_1 = require("./queue-base");
const job_1 = require("./job");
const parser = require('cron-parser');
class Repeat extends queue_base_1.QueueBase {
    async addNextRepeatableJob(name, data, opts, skipCheckExists) {
        const repeatOpts = Object.assign({}, opts.repeat);
        const prevMillis = opts.prevMillis || 0;
        const currentCount = repeatOpts.count ? repeatOpts.count + 1 : 1;
        if (typeof repeatOpts.limit !== 'undefined' &&
            currentCount > repeatOpts.limit) {
            return;
        }
        let now = Date.now();
        now = prevMillis < now ? now : prevMillis;
        const nextMillis = getNextMillis(now, repeatOpts);
        if (nextMillis) {
            // We store the undecorated opts.jobId into the repeat options
            if (!prevMillis && opts.jobId) {
                repeatOpts.jobId = opts.jobId;
            }
            const repeatJobKey = getRepeatKey(name, repeatOpts);
            let repeatableExists = true;
            if (!skipCheckExists) {
                // Check that the repeatable job hasn't been removed
                // TODO: a lua script would be better here
                const client = await this.client;
                repeatableExists = !!(await client.zscore(this.keys.repeat, repeatJobKey));
            }
            // The job could have been deleted since this check
            if (repeatableExists) {
                return this.createNextJob(name, nextMillis, repeatJobKey, Object.assign(Object.assign({}, opts), { repeat: repeatOpts }), data, currentCount);
            }
        }
    }
    async createNextJob(name, nextMillis, repeatJobKey, opts, data, currentCount) {
        const client = await this.client;
        //
        // Generate unique job id for this iteration.
        //
        const jobId = getRepeatJobId(name, nextMillis, md5(repeatJobKey), opts.repeat.jobId);
        const now = Date.now();
        const delay = nextMillis - now;
        const mergedOpts = Object.assign(Object.assign({}, opts), { jobId, delay: delay < 0 ? 0 : delay, timestamp: now, prevMillis: nextMillis });
        mergedOpts.repeat = Object.assign(Object.assign({}, opts.repeat), { count: currentCount });
        await client.zadd(this.keys.repeat, nextMillis.toString(), repeatJobKey);
        return job_1.Job.create(this, name, data, mergedOpts);
    }
    async removeRepeatable(name, repeat, jobId) {
        const client = await this.client;
        const repeatJobKey = getRepeatKey(name, Object.assign(Object.assign({}, repeat), { jobId }));
        const repeatJobId = getRepeatJobId(name, '', md5(repeatJobKey), jobId || repeat.jobId);
        const queueKey = this.keys[''];
        return client.removeRepeatable(this.keys.repeat, this.keys.delayed, repeatJobId, repeatJobKey, queueKey);
    }
    async removeRepeatableByKey(repeatJobKey) {
        const client = await this.client;
        const data = this._keyToData(repeatJobKey);
        const queueKey = this.keys[''];
        const repeatJobId = getRepeatJobId(data.name, '', md5(repeatJobKey), data.id);
        return client.removeRepeatable(this.keys.repeat, this.keys.delayed, repeatJobId, repeatJobKey, queueKey);
    }
    _keyToData(key) {
        const data = key.split(':');
        return {
            key,
            name: data[0],
            id: data[1] || null,
            endDate: parseInt(data[2]) || null,
            tz: data[3] || null,
            cron: data[4],
        };
    }
    async getRepeatableJobs(start = 0, end = -1, asc = false) {
        const client = await this.client;
        const key = this.keys.repeat;
        const result = asc
            ? await client.zrange(key, start, end, 'WITHSCORES')
            : await client.zrevrange(key, start, end, 'WITHSCORES');
        const jobs = [];
        for (let i = 0; i < result.length; i += 2) {
            const data = result[i].split(':');
            jobs.push({
                key: result[i],
                name: data[0],
                id: data[1] || null,
                endDate: parseInt(data[2]) || null,
                tz: data[3] || null,
                cron: data[4],
                next: parseInt(result[i + 1]),
            });
        }
        return jobs;
    }
    async getRepeatableCount() {
        const client = await this.client;
        return client.zcard(this.toKey('repeat'));
    }
}
exports.Repeat = Repeat;
function getRepeatJobId(name, nextMillis, namespace, jobId) {
    const checksum = md5(`${name}${jobId || ''}${namespace}`);
    return `repeat:${checksum}:${nextMillis}`;
    // return `repeat:${jobId || ''}:${name}:${namespace}:${nextMillis}`;
    //return `repeat:${name}:${namespace}:${nextMillis}`;
}
function getRepeatKey(name, repeat) {
    const endDate = repeat.endDate ? new Date(repeat.endDate).getTime() : '';
    const tz = repeat.tz || '';
    const suffix = (repeat.cron ? repeat.cron : String(repeat.every)) || '';
    const jobId = repeat.jobId ? repeat.jobId : '';
    return `${name}:${jobId}:${endDate}:${tz}:${suffix}`;
}
function getNextMillis(millis, opts) {
    if (opts.cron && opts.every) {
        throw new Error('Both .cron and .every options are defined for this repeatable job');
    }
    if (opts.every) {
        return Math.floor(millis / opts.every) * opts.every + opts.every;
    }
    const currentDate = opts.startDate && new Date(opts.startDate) > new Date(millis)
        ? new Date(opts.startDate)
        : new Date(millis);
    const interval = parser.parseExpression(opts.cron, Object.assign(Object.assign({}, opts), { currentDate }));
    try {
        return interval.next().getTime();
    }
    catch (e) {
        // Ignore error
    }
}
function md5(str) {
    return crypto_1.createHash('md5')
        .update(str)
        .digest('hex');
}
//# sourceMappingURL=repeat.js.map