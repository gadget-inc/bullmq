import { Cluster } from 'ioredis';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { CONNECTION_CLOSED_ERROR_MSG } from 'ioredis/built/utils';
import { v4 } from 'uuid';
import { get } from 'lodash';
export const errorObject = { value: null };
export function tryCatch(fn, ctx, args) {
    try {
        return fn.apply(ctx, args);
    }
    catch (e) {
        errorObject.value = e;
        return errorObject;
    }
}
/**
 * Checks the size of string for ascii/non-ascii characters
 * @see https://stackoverflow.com/a/23318053/1347170
 * @param str -
 */
export function lengthInUtf8Bytes(str) {
    return Buffer.byteLength(str, 'utf8');
}
export function isEmpty(obj) {
    for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
            return false;
        }
    }
    return true;
}
export function array2obj(arr) {
    const obj = {};
    for (let i = 0; i < arr.length; i += 2) {
        obj[arr[i]] = arr[i + 1];
    }
    return obj;
}
export function delay(ms) {
    return new Promise(resolve => {
        setTimeout(() => resolve(), ms);
    });
}
export function isRedisInstance(obj) {
    if (!obj) {
        return false;
    }
    const redisApi = ['connect', 'disconnect', 'duplicate'];
    return redisApi.every(name => typeof obj[name] === 'function');
}
export function isRedisCluster(obj) {
    return isRedisInstance(obj) && obj.isCluster;
}
export async function removeAllQueueData(client, queueName, prefix = 'bull') {
    if (client instanceof Cluster) {
        // todo compat with cluster ?
        // @see https://github.com/luin/ioredis/issues/175
        return Promise.resolve(false);
    }
    const pattern = `${prefix}:${queueName}:*`;
    return new Promise((resolve, reject) => {
        const stream = client.scanStream({
            match: pattern,
        });
        stream.on('data', (keys) => {
            if (keys.length) {
                const pipeline = client.pipeline();
                keys.forEach(key => {
                    pipeline.del(key);
                });
                pipeline.exec().catch(error => {
                    reject(error);
                });
            }
        });
        stream.on('end', () => resolve());
        stream.on('error', error => reject(error));
    });
}
export function getParentKey(opts) {
    if (opts) {
        return `${opts.queue}:${opts.id}`;
    }
}
export function jobIdForGroup(jobOpts, data, queueOpts) {
    const jobId = jobOpts === null || jobOpts === void 0 ? void 0 : jobOpts.jobId;
    const groupKeyPath = get(queueOpts, 'limiter.groupKey');
    const groupKey = get(data, groupKeyPath);
    if (groupKeyPath && !(typeof groupKey === 'undefined')) {
        return `${jobId || v4()}:${groupKey}`;
    }
    return jobId;
}
export const clientCommandMessageReg = /ERR unknown command ['`]\s*client\s*['`]/;
export const DELAY_TIME_5 = 5000;
export const DELAY_TIME_1 = 100;
export function isNotConnectionError(error) {
    const errorMessage = `${error.message}`;
    return (errorMessage !== CONNECTION_CLOSED_ERROR_MSG &&
        !errorMessage.includes('ECONNREFUSED'));
}
export const asyncSend = (proc, msg) => {
    return new Promise((resolve, reject) => {
        if (typeof proc.send === 'function') {
            proc.send(msg, (err) => {
                if (err) {
                    reject(err);
                }
                else {
                    resolve();
                }
            });
        }
        else {
            resolve();
        }
    });
};
export const childSend = (proc, msg) => asyncSend(proc, msg);
export const parentSend = (child, msg) => asyncSend(child, msg);
export const WORKER_SUFFIX = '';
export const QUEUE_SCHEDULER_SUFFIX = ':qs';
export const QUEUE_EVENT_SUFFIX = ':qe';
//# sourceMappingURL=utils.js.map