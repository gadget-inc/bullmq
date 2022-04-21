"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.QueueBase = void 0;
const events_1 = require("events");
const redis_connection_1 = require("./redis-connection");
const queue_keys_1 = require("./queue-keys");
class QueueBase extends events_1.EventEmitter {
    constructor(name, opts = {}) {
        super();
        this.name = name;
        this.opts = opts;
        this.opts = Object.assign({ prefix: 'bull' }, opts);
        this.connection = new redis_connection_1.RedisConnection(opts.connection);
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
    async waitUntilReady() {
        return this.client;
    }
    base64Name() {
        return Buffer.from(this.name).toString('base64');
    }
    clientName() {
        return this.opts.prefix + ':' + this.base64Name();
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
}
exports.QueueBase = QueueBase;
//# sourceMappingURL=queue-base.js.map