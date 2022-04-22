import { RedisClient } from './classes';
export declare const errorObject: {
    [index: string]: any;
};
export declare function tryCatch(fn: (...args: any) => any, ctx: any, args: any[]): any;
/**
 * Checks the size of string for ascii/non-ascii characters
 * (Reference: https://stackoverflow.com/a/23318053/1347170)
 * @param {string} str
 */
export declare function lengthInUtf8Bytes(str: string): number;
export declare function isEmpty(obj: object): boolean;
export declare function array2obj(arr: string[]): {
    [index: string]: string;
};
export declare function delay(ms: number): Promise<void>;
export declare function isRedisInstance(obj: any): boolean;
export declare function removeAllQueueData(client: RedisClient, queueName: string, prefix?: string): Promise<boolean | void>;
