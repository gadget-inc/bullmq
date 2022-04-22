"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RedisConnection = void 0;
const events_1 = require("events");
const IORedis = require("ioredis");
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
const utils_1 = require("ioredis/built/utils");
const semver = require("semver");
const commands_1 = require("../commands");
const utils_2 = require("../utils");
const path = require("path");
const overrideMessage = [
    'BullMQ: WARNING! Your redis options maxRetriesPerRequest must be null',
    'and will be overridden by BullMQ.',
].join(' ');
const deprecationMessage = [
    'BullMQ: DEPRECATION WARNING! Your redis options maxRetriesPerRequest must be null.',
    'On the next versions having this settings will throw an exception',
].join(' ');
const upstashMessage = 'BullMQ: Upstash is not compatible with BullMQ.';
class RedisConnection extends events_1.EventEmitter {
    constructor(opts, shared = false, blocking = true) {
        super();
        this.shared = shared;
        this.blocking = blocking;
        if (!utils_2.isRedisInstance(opts)) {
            this.checkBlockingOptions(overrideMessage, opts);
            this.opts = Object.assign({ port: 6379, host: '127.0.0.1', retryStrategy: function (times) {
                    return Math.min(Math.exp(times), 20000);
                } }, opts);
            if (this.blocking) {
                this.opts.maxRetriesPerRequest = null;
            }
        }
        else {
            this._client = opts;
            this.opts = utils_2.isRedisCluster(this._client)
                ? this._client.options.redisOptions
                : this._client.options;
            this.checkBlockingOptions(deprecationMessage, this.opts);
        }
        this.checkUpstashHost(this.opts.host);
        this.handleClientError = (err) => {
            this.emit('error', err);
        };
        this.initializing = this.init();
        this.initializing.catch(err => this.emit('error', err));
    }
    checkBlockingOptions(msg, options) {
        if (this.blocking && options && options.maxRetriesPerRequest) {
            console.error(msg);
        }
    }
    checkUpstashHost(host) {
        if (host === null || host === void 0 ? void 0 : host.endsWith('upstash.io')) {
            throw new Error(upstashMessage);
        }
    }
    /**
     * Waits for a redis client to be ready.
     * @param redis - client
     */
    static async waitUntilReady(client) {
        if (client.status === 'ready') {
            return;
        }
        if (client.status === 'wait' && !client.options.lazyConnect) {
            return client.connect();
        }
        if (client.status === 'end') {
            throw new Error(utils_1.CONNECTION_CLOSED_ERROR_MSG);
        }
        return new Promise((resolve, reject) => {
            let lastError;
            const errorHandler = (err) => {
                lastError = err;
            };
            const handleReady = () => {
                client.removeListener('end', endHandler);
                client.removeListener('error', errorHandler);
                resolve();
            };
            const endHandler = () => {
                client.removeListener('ready', handleReady);
                client.removeListener('error', errorHandler);
                reject(lastError || new Error(utils_1.CONNECTION_CLOSED_ERROR_MSG));
            };
            client.once('ready', handleReady);
            client.on('end', endHandler);
            client.once('error', errorHandler);
        });
    }
    get client() {
        return this.initializing;
    }
    loadCommands() {
        return (this._client['bullmq:loadingCommands'] ||
            (this._client['bullmq:loadingCommands'] = commands_1.scriptLoader.load(this._client, path.join(__dirname, '../commands'))));
    }
    async init() {
        if (!this._client) {
            this._client = new IORedis(this.opts);
        }
        this._client.on('error', this.handleClientError);
        await RedisConnection.waitUntilReady(this._client);
        await this.loadCommands();
        if (this.opts && this.opts.skipVersionCheck !== true && !this.closing) {
            this.version = await this.getRedisVersion();
            const version = semver.valid(semver.coerce(this.version));
            if (semver.lt(version, RedisConnection.minimumVersion)) {
                throw new Error(`Redis version needs to be greater than ${RedisConnection.minimumVersion} Current: ${this.version}`);
            }
        }
        return this._client;
    }
    async disconnect() {
        const client = await this.client;
        if (client.status !== 'end') {
            let _resolve, _reject;
            const disconnecting = new Promise((resolve, reject) => {
                client.once('end', resolve);
                client.once('error', reject);
                _resolve = resolve;
                _reject = reject;
            });
            client.disconnect();
            try {
                await disconnecting;
            }
            finally {
                client.removeListener('end', _resolve);
                client.removeListener('error', _reject);
            }
        }
    }
    async reconnect() {
        const client = await this.client;
        return client.connect();
    }
    async close() {
        if (!this.closing) {
            this.closing = true;
            try {
                await this.initializing;
                if (!this.shared) {
                    await this._client.quit();
                }
            }
            catch (error) {
                if (utils_2.isNotConnectionError(error)) {
                    throw error;
                }
            }
            finally {
                this._client.off('error', this.handleClientError);
            }
        }
    }
    async getRedisVersion() {
        const doc = await this._client.info();
        const prefix = 'redis_version:';
        const lines = doc.split('\r\n');
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].indexOf(prefix) === 0) {
                return lines[i].substr(prefix.length);
            }
        }
    }
    get redisVersion() {
        return this.version;
    }
}
exports.RedisConnection = RedisConnection;
RedisConnection.minimumVersion = '5.0.0';
//# sourceMappingURL=redis-connection.js.map