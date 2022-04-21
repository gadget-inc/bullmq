"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.QueueBase = void 0;
const events_1 = require("events");
const utils_1 = require("../utils");
const redis_connection_1 = require("./redis-connection");
const queue_keys_1 = require("./queue-keys");
class QueueBase extends events_1.EventEmitter {
    constructor(name, opts = {}, Connection = redis_connection_1.RedisConnection) {
        super();
        this.name = name;
        this.opts = opts;
        this.opts = Object.assign({ prefix: 'bull' }, opts);
        if (!opts.connection) {
            console.warn([
                'BullMQ: DEPRECATION WARNING! Optional instantiation of Queue, Worker, QueueScheduler and QueueEvents',
                'without providing explicitly a connection or connection options is deprecated. This behaviour will',
                'be removed in the next major release',
            ].join(' '));
        }
        this.connection = new Connection(opts.connection, opts.sharedConnection, opts.blockingConnection);
        this.connection.on('error', this.emit.bind(this, 'error'));
        const queueKeys = new queue_keys_1.QueueKeys(opts.prefix);
        this.keys = queueKeys.getKeys(name);
        this.toKey = (type) => queueKeys.toKey(name, type);
    }
    get client() {
        return this.connection.client;
    }
    get redisVersion() {
        return this.connection.redisVersion;
    }
    emit(event, ...args) {
        try {
            return super.emit(event, ...args);
        }
        catch (err) {
            try {
                return super.emit('error', err);
            }
            catch (err) {
                // We give up if the error event also throws an exception.
                console.error(err);
            }
        }
    }
    waitUntilReady() {
        return this.client;
    }
    base64Name() {
        return Buffer.from(this.name).toString('base64');
    }
    clientName(suffix = '') {
        const queueNameBase64 = this.base64Name();
        return `${this.opts.prefix}:${queueNameBase64}${suffix}`;
    }
    close() {
        if (!this.closing) {
            this.closing = this.connection.close();
        }
        return this.closing;
    }
    disconnect() {
        return this.connection.disconnect();
    }
    async checkConnectionError(fn, delayInMs = utils_1.DELAY_TIME_5) {
        try {
            return await fn();
        }
        catch (error) {
            if ((0, utils_1.isNotConnectionError)(error)) {
                this.emit('error', error);
            }
            if (!this.closing && delayInMs) {
                await (0, utils_1.delay)(delayInMs);
            }
            else {
                return;
            }
        }
    }
}
exports.QueueBase = QueueBase;
//# sourceMappingURL=queue-base.js.map