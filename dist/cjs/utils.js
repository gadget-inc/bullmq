"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.QUEUE_EVENT_SUFFIX = exports.QUEUE_SCHEDULER_SUFFIX = exports.WORKER_SUFFIX = exports.parentSend = exports.childSend = exports.asyncSend = exports.isNotConnectionError = exports.DELAY_TIME_1 = exports.DELAY_TIME_5 = exports.clientCommandMessageReg = exports.jobIdForGroup = exports.getParentKey = exports.removeAllQueueData = exports.isRedisCluster = exports.isRedisInstance = exports.delay = exports.array2obj = exports.isEmpty = exports.lengthInUtf8Bytes = exports.tryCatch = exports.errorObject = void 0;
const ioredis_1 = require("ioredis");
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
const utils_1 = require("ioredis/built/utils");
const uuid_1 = require("uuid");
const lodash_1 = require("lodash");
exports.errorObject = { value: null };
function tryCatch(fn, ctx, args) {
    try {
        return fn.apply(ctx, args);
    }
    catch (e) {
        exports.errorObject.value = e;
        return exports.errorObject;
    }
}
exports.tryCatch = tryCatch;
/**
 * Checks the size of string for ascii/non-ascii characters
 * @see https://stackoverflow.com/a/23318053/1347170
 * @param str -
 */
function lengthInUtf8Bytes(str) {
    return Buffer.byteLength(str, 'utf8');
}
exports.lengthInUtf8Bytes = lengthInUtf8Bytes;
function isEmpty(obj) {
    for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
            return false;
        }
    }
    return true;
}
exports.isEmpty = isEmpty;
function array2obj(arr) {
    const obj = {};
    for (let i = 0; i < arr.length; i += 2) {
        obj[arr[i]] = arr[i + 1];
    }
    return obj;
}
exports.array2obj = array2obj;
function delay(ms) {
    return new Promise(resolve => {
        setTimeout(() => resolve(), ms);
    });
}
exports.delay = delay;
function isRedisInstance(obj) {
    if (!obj) {
        return false;
    }
    const redisApi = ['connect', 'disconnect', 'duplicate'];
    return redisApi.every(name => typeof obj[name] === 'function');
}
exports.isRedisInstance = isRedisInstance;
function isRedisCluster(obj) {
    return isRedisInstance(obj) && obj.isCluster;
}
exports.isRedisCluster = isRedisCluster;
async function removeAllQueueData(client, queueName, prefix = 'bull') {
    if (client instanceof ioredis_1.Cluster) {
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
exports.removeAllQueueData = removeAllQueueData;
function getParentKey(opts) {
    if (opts) {
        return `${opts.queue}:${opts.id}`;
    }
}
exports.getParentKey = getParentKey;
function jobIdForGroup(jobOpts, data, queueOpts) {
    const jobId = jobOpts === null || jobOpts === void 0 ? void 0 : jobOpts.jobId;
    const groupKeyPath = (0, lodash_1.get)(queueOpts, 'limiter.groupKey');
    const groupKey = (0, lodash_1.get)(data, groupKeyPath);
    if (groupKeyPath && !(typeof groupKey === 'undefined')) {
        return `${jobId || (0, uuid_1.v4)()}:${groupKey}`;
    }
    return jobId;
}
exports.jobIdForGroup = jobIdForGroup;
exports.clientCommandMessageReg = /ERR unknown command ['`]\s*client\s*['`]/;
exports.DELAY_TIME_5 = 5000;
exports.DELAY_TIME_1 = 100;
function isNotConnectionError(error) {
    const errorMessage = `${error.message}`;
    return (errorMessage !== utils_1.CONNECTION_CLOSED_ERROR_MSG &&
        !errorMessage.includes('ECONNREFUSED'));
}
exports.isNotConnectionError = isNotConnectionError;
const asyncSend = (proc, msg) => {
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
exports.asyncSend = asyncSend;
const childSend = (proc, msg) => (0, exports.asyncSend)(proc, msg);
exports.childSend = childSend;
const parentSend = (child, msg) => (0, exports.asyncSend)(child, msg);
exports.parentSend = parentSend;
exports.WORKER_SUFFIX = '';
exports.QUEUE_SCHEDULER_SUFFIX = ':qs';
exports.QUEUE_EVENT_SUFFIX = ':qe';
//# sourceMappingURL=utils.js.map