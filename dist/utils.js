"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.removeAllQueueData = exports.isRedisInstance = exports.delay = exports.array2obj = exports.isEmpty = exports.lengthInUtf8Bytes = exports.tryCatch = exports.errorObject = void 0;
const ioredis_1 = require("ioredis");
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
 * (Reference: https://stackoverflow.com/a/23318053/1347170)
 * @param {string} str
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
//# sourceMappingURL=utils.js.map