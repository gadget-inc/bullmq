/*eslint-env node */
'use strict';
import { QueueBase } from './queue-base';
import { Job } from './job';
import { clientCommandMessageReg, QUEUE_SCHEDULER_SUFFIX, QUEUE_EVENT_SUFFIX, WORKER_SUFFIX, } from '../utils';
export class QueueGetters extends QueueBase {
    getJob(jobId) {
        return Job.fromId(this, jobId);
    }
    commandByType(types, count, callback) {
        return types.map((type) => {
            type = type === 'waiting' ? 'wait' : type; // alias
            const key = this.toKey(type);
            switch (type) {
                case 'completed':
                case 'failed':
                case 'delayed':
                case 'repeat':
                case 'waiting-children':
                    return callback(key, count ? 'zcard' : 'zrange');
                case 'active':
                case 'wait':
                case 'paused':
                    return callback(key, count ? 'llen' : 'lrange');
            }
        });
    }
    sanitizeJobTypes(types) {
        const currentTypes = typeof types === 'string' ? [types] : types;
        if (Array.isArray(currentTypes) && currentTypes.length > 0) {
            const sanitizedTypes = [...currentTypes];
            if (sanitizedTypes.indexOf('waiting') !== -1) {
                sanitizedTypes.push('paused');
            }
            return [...new Set(sanitizedTypes)];
        }
        return [
            'active',
            'completed',
            'delayed',
            'failed',
            'paused',
            'waiting',
            'waiting-children',
        ];
    }
    /**
      Returns the number of jobs waiting to be processed.
    */
    count() {
        return this.getJobCountByTypes('waiting', 'paused', 'delayed', 'waiting-children');
    }
    /**
     * Job counts by type
     *
     * Queue#getJobCountByTypes('completed') => completed count
     * Queue#getJobCountByTypes('completed,failed') => completed + failed count
     * Queue#getJobCountByTypes('completed', 'failed') => completed + failed count
     * Queue#getJobCountByTypes('completed', 'waiting', 'failed') => completed + waiting + failed count
     */
    async getJobCountByTypes(...types) {
        const result = await this.getJobCounts(...types);
        return Object.values(result).reduce((sum, count) => sum + count, 0);
    }
    /**
     * Returns the job counts for each type specified or every list/set in the queue by default.
     *
     * @returns An object, key (type) and value (count)
     */
    async getJobCounts(...types) {
        const currentTypes = this.sanitizeJobTypes(types);
        const client = await this.client;
        const multi = client.multi();
        this.commandByType(currentTypes, true, function (key, command) {
            multi[command](key);
        });
        const res = await multi.exec();
        const counts = {};
        res.forEach((res, index) => {
            counts[currentTypes[index]] = res[1] || 0;
        });
        return counts;
    }
    /**
     * Returns the number of jobs in completed status.
     */
    getCompletedCount() {
        return this.getJobCountByTypes('completed');
    }
    /**
     * Returns the number of jobs in failed status.
     */
    getFailedCount() {
        return this.getJobCountByTypes('failed');
    }
    /**
     * Returns the number of jobs in delayed status.
     */
    getDelayedCount() {
        return this.getJobCountByTypes('delayed');
    }
    /**
     * Returns the number of jobs in active status.
     */
    getActiveCount() {
        return this.getJobCountByTypes('active');
    }
    /**
     * Returns the number of jobs in waiting or paused statuses.
     */
    getWaitingCount() {
        return this.getJobCountByTypes('waiting');
    }
    /**
     * Returns the number of jobs in waiting-children status.
     */
    getWaitingChildrenCount() {
        return this.getJobCountByTypes('waiting-children');
    }
    getWaiting(start = 0, end = -1) {
        return this.getJobs(['waiting'], start, end, true);
    }
    getWaitingChildren(start = 0, end = -1) {
        return this.getJobs(['waiting-children'], start, end, true);
    }
    getActive(start = 0, end = -1) {
        return this.getJobs(['active'], start, end, true);
    }
    getDelayed(start = 0, end = -1) {
        return this.getJobs(['delayed'], start, end, true);
    }
    getCompleted(start = 0, end = -1) {
        return this.getJobs(['completed'], start, end, false);
    }
    getFailed(start = 0, end = -1) {
        return this.getJobs(['failed'], start, end, false);
    }
    async getRanges(types, start = 0, end = 1, asc = false) {
        const client = await this.client;
        const multi = client.multi();
        const multiCommands = [];
        this.commandByType(types, false, (key, command) => {
            switch (command) {
                case 'lrange':
                    multiCommands.push('lrange');
                    if (asc) {
                        multi.lrange(key, -(end + 1), -(start + 1));
                    }
                    else {
                        multi.lrange(key, start, end);
                    }
                    break;
                case 'zrange':
                    multiCommands.push('zrange');
                    if (asc) {
                        multi.zrange(key, start, end);
                    }
                    else {
                        multi.zrevrange(key, start, end);
                    }
                    break;
            }
        });
        const responses = await multi.exec();
        let results = [];
        responses.forEach((response, index) => {
            const result = response[1] || [];
            if (asc && multiCommands[index] === 'lrange') {
                results = results.concat(result.reverse());
            }
            else {
                results = results.concat(result);
            }
        });
        return [...new Set(results)];
    }
    async getJobs(types, start = 0, end = -1, asc = false) {
        types = this.sanitizeJobTypes(types);
        const jobIds = await this.getRanges(types, start, end, asc);
        return Promise.all(jobIds.map(jobId => Job.fromId(this, jobId)));
    }
    async getJobLogs(jobId, start = 0, end = -1, asc = true) {
        const client = await this.client;
        const multi = client.multi();
        const logsKey = this.toKey(jobId + ':logs');
        if (asc) {
            multi.lrange(logsKey, start, end);
        }
        else {
            multi.lrange(logsKey, -(end + 1), -(start + 1));
        }
        multi.llen(logsKey);
        return multi.exec().then(result => {
            if (!asc) {
                result[0][1].reverse();
            }
            return {
                logs: result[0][1],
                count: result[1][1],
            };
        });
    }
    async baseGetClients(suffix) {
        const client = await this.client;
        const clients = await client.client('list');
        try {
            const list = this.parseClientList(clients, suffix);
            return list;
        }
        catch (err) {
            if (!clientCommandMessageReg.test(err.message)) {
                throw err;
            }
        }
    }
    /**
     * Get worker list related to the queue.
     *
     * @returns - Returns an array with workers info.
     */
    getWorkers() {
        return this.baseGetClients(WORKER_SUFFIX);
    }
    /**
     * Get queue schedulers list related to the queue.
     *
     * @returns - Returns an array with queue schedulers info.
     */
    async getQueueSchedulers() {
        return this.baseGetClients(QUEUE_SCHEDULER_SUFFIX);
    }
    /**
     * Get queue events list related to the queue.
     *
     * @returns - Returns an array with queue events info.
     */
    async getQueueEvents() {
        return this.baseGetClients(QUEUE_EVENT_SUFFIX);
    }
    /**
     * Get queue metrics related to the queue.
     *
     * This method returns the gathered metrics for the queue.
     * The metrics are represented as an array of job counts
     * per unit of time (1 minute).
     *
     * @param start - Start point of the metrics, where 0
     * is the newest point to be returned.
     * @param end - End point of the metrics, where -1 is the
     * oldest point to be returned.
     *
     * @returns - Returns an object with queue metrics.
     */
    async getMetrics(type, start = 0, end = -1) {
        const client = await this.client;
        const metricsKey = this.toKey(`metrics:${type}`);
        const dataKey = `${metricsKey}:data`;
        const multi = client.multi();
        multi.hmget(metricsKey, 'count', 'prevTS', 'prevCount');
        multi.lrange(dataKey, start, end);
        multi.llen(dataKey);
        const [hmget, range, len] = await multi.exec();
        const [err, [count, prevTS, prevCount]] = hmget;
        const [err2, data] = range;
        const [err3, numPoints] = len;
        if (err || err2) {
            throw err || err2 || err3;
        }
        return {
            meta: {
                count: parseInt(count || '0', 10),
                prevTS: parseInt(prevTS || '0', 10),
                prevCount: parseInt(prevCount || '0', 10),
            },
            data,
            count: numPoints,
        };
    }
    parseClientList(list, suffix = '') {
        const lines = list.split('\n');
        const clients = [];
        lines.forEach((line) => {
            const client = {};
            const keyValues = line.split(' ');
            keyValues.forEach(function (keyValue) {
                const index = keyValue.indexOf('=');
                const key = keyValue.substring(0, index);
                const value = keyValue.substring(index + 1);
                client[key] = value;
            });
            const name = client['name'];
            if (name && name === `${this.clientName()}${suffix ? `${suffix}` : ''}`) {
                client['name'] = this.name;
                clients.push(client);
            }
        });
        return clients;
    }
}
//# sourceMappingURL=queue-getters.js.map