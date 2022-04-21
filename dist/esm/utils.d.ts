/// <reference types="node" />
import { RedisClient, JobsOptions, QueueOptions, ChildMessage, ParentMessage } from './interfaces';
import { ChildProcess } from 'child_process';
export declare const errorObject: {
    [index: string]: any;
};
export declare function tryCatch(fn: (...args: any) => any, ctx: any, args: any[]): any;
/**
 * Checks the size of string for ascii/non-ascii characters
 * @see https://stackoverflow.com/a/23318053/1347170
 * @param str -
 */
export declare function lengthInUtf8Bytes(str: string): number;
export declare function isEmpty(obj: object): boolean;
export declare function array2obj(arr: string[]): Record<string, string>;
export declare function delay(ms: number): Promise<void>;
export declare function isRedisInstance(obj: any): boolean;
export declare function removeAllQueueData(client: RedisClient, queueName: string, prefix?: string): Promise<void | boolean>;
export declare function getParentKey(opts: {
    id: string;
    queue: string;
}): string;
export declare function jobIdForGroup(jobOpts: JobsOptions, data: any, queueOpts: QueueOptions): string;
export declare const clientCommandMessageReg: RegExp;
export declare const DELAY_TIME_5 = 5000;
export declare const DELAY_TIME_1 = 100;
export declare function isNotConnectionError(error: Error): boolean;
export declare const childSend: (proc: NodeJS.Process, msg: ChildMessage) => Promise<void>;
export declare const parentSend: (child: ChildProcess, msg: ParentMessage) => Promise<void>;
