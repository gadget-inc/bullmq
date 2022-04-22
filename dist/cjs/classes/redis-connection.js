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
    'BullMQ: WARNING! Your redis options maxRetriesPerRequest must be null and enableReadyCheck false',
    'and will be overrided by BullMQ.',
].join(' ');
const deprecationMessage = [
    'BullMQ: DEPRECATION WARNING! Your redis options maxRetriesPerRequest must be null and enableReadyCheck false.',
    'On the next versions having this settings will throw an exception',
].join(' ');
class RedisConnection extends events_1.EventEmitter {
    constructor(opts, shared = false) {
        super();
        this.opts = opts;
        this.shared = shared;
        if (!(0, utils_2.isRedisInstance)(opts)) {
            this.checkOptions(overrideMessage, opts);
            this.opts = Object.assign(Object.assign({ port: 6379, host: '127.0.0.1', retryStrategy: function (times) {
                    return Math.min(Math.exp(times), 20000);
                } }, opts), { maxRetriesPerRequest: null, enableReadyCheck: false });
        }
        else {
            this._client = opts;
            let options = this._client.options;
            if (options === null || options === void 0 ? void 0 : options.redisOptions) {
                options = options.redisOptions;
            }
            this.checkOptions(deprecationMessage, options);
        }
        this.handleClientError = (err) => {
            this.emit('error', err);
        };
        this.initializing = this.init();
        this.initializing.catch(err => this.emit('error', err));
    }
    checkOptions(msg, options) {
        if (options && (options.maxRetriesPerRequest || options.enableReadyCheck)) {
            console.error(msg);
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
        const opts = this.opts;
        if (!this._client) {
            this._client = new IORedis(opts);
        }
        this._client.on('error', this.handleClientError);
        await RedisConnection.waitUntilReady(this._client);
        await this.loadCommands();
        if (opts && opts.skipVersionCheck !== true && !this.closing) {
            this.version = await this.getRedisVersion();
            if (semver.lt(this.version, RedisConnection.minimumVersion)) {
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
                if ((0, utils_2.isNotConnectionError)(error)) {
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