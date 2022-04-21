/// <reference types="node" />
import { EventEmitter } from 'events';
import { Cluster, Redis } from 'ioredis';
import { ConnectionOptions } from '../interfaces';
export declare type RedisClient = Redis | Cluster;
export declare class RedisConnection extends EventEmitter {
    private readonly opts?;
    static minimumVersion: string;
    private _client;
    private initializing;
    private closing;
    private version;
    constructor(opts?: ConnectionOptions);
    /**
     * Waits for a redis client to be ready.
     * @param {Redis} redis client
     */
    static waitUntilReady(client: RedisClient): Promise<void>;
    get client(): Promise<RedisClient>;
    private init;
    disconnect(): Promise<void>;
    reconnect(): Promise<void>;
    close(): Promise<void>;
    private getRedisVersion;
    get redisVersion(): string;
}
