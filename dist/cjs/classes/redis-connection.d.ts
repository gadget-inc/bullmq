/// <reference types="node" />
import { EventEmitter } from 'events';
import { ConnectionOptions, RedisClient } from '../interfaces';
export declare class RedisConnection extends EventEmitter {
    private readonly opts?;
    private readonly shared;
    static minimumVersion: string;
    protected _client: RedisClient;
    private initializing;
    private closing;
    private version;
    private handleClientError;
    constructor(opts?: ConnectionOptions, shared?: boolean);
    private checkOptions;
    /**
     * Waits for a redis client to be ready.
     * @param redis - client
     */
    static waitUntilReady(client: RedisClient): Promise<void>;
    get client(): Promise<RedisClient>;
    protected loadCommands(): Promise<void>;
    private init;
    disconnect(): Promise<void>;
    reconnect(): Promise<void>;
    close(): Promise<void>;
    private getRedisVersion;
    get redisVersion(): string;
}
