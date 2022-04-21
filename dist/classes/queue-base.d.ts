/// <reference types="node" />
import { EventEmitter } from 'events';
import { QueueBaseOptions } from '../interfaces';
import { RedisClient, RedisConnection } from './redis-connection';
import { KeysMap } from './queue-keys';
export declare class QueueBase extends EventEmitter {
    readonly name: string;
    opts: QueueBaseOptions;
    toKey: (type: string) => string;
    keys: KeysMap;
    closing: Promise<void>;
    protected connection: RedisConnection;
    constructor(name: string, opts?: QueueBaseOptions);
    get client(): Promise<RedisClient>;
    get redisVersion(): string;
    waitUntilReady(): Promise<RedisClient>;
    protected base64Name(): string;
    protected clientName(): string;
    close(): Promise<void>;
    disconnect(): Promise<void>;
}
