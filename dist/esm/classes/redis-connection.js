import { EventEmitter } from 'events';
import * as IORedis from 'ioredis';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { CONNECTION_CLOSED_ERROR_MSG } from 'ioredis/built/utils';
import * as semver from 'semver';
import { scriptLoader } from '../commands';
import { isRedisInstance, isNotConnectionError } from '../utils';
import * as path from 'path';
const overrideMessage = [
    'BullMQ: WARNING! Your redis options maxRetriesPerRequest must be null and enableReadyCheck false',
    'and will be overrided by BullMQ.',
].join(' ');
const deprecationMessage = [
    'BullMQ: DEPRECATION WARNING! Your redis options maxRetriesPerRequest must be null and enableReadyCheck false.',
    'On the next versions having this settings will throw an exception',
].join(' ');
export class RedisConnection extends EventEmitter {
    constructor(opts, shared = false) {
        super();
        this.opts = opts;
        this.shared = shared;
        if (!isRedisInstance(opts)) {
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
            throw new Error(CONNECTION_CLOSED_ERROR_MSG);
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
                reject(lastError || new Error(CONNECTION_CLOSED_ERROR_MSG));
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
            (this._client['bullmq:loadingCommands'] = scriptLoader.load(this._client, path.join(__dirname, '../commands'))));
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
                if (isNotConnectionError(error)) {
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
RedisConnection.minimumVersion = '5.0.0';
//# sourceMappingURL=redis-connection.js.map