/**
 * Includes all the scripts needed by the queue and jobs.
 */
import { JobsOptions } from '../interfaces';
import { Worker } from './worker';
import { QueueScheduler } from './queue-scheduler';
import { QueueBase } from './queue-base';
import { Job, JobJson, JobJsonRaw } from './job';
import { RedisClient } from './redis-connection';
export declare type MinimalQueue = Pick<QueueBase, 'client' | 'toKey' | 'keys' | 'opts' | 'closing' | 'waitUntilReady' | 'removeListener' | 'emit' | 'on' | 'redisVersion'>;
export declare type ParentOpts = {
    waitChildrenKey?: string;
    parentDependenciesKey?: string;
    parentKey?: string;
};
export declare class Scripts {
    static isJobInList(queue: MinimalQueue, listKey: string, jobId: string): Promise<boolean>;
    static addJob(client: RedisClient, queue: MinimalQueue, job: JobJson, opts: JobsOptions, jobId: string, parentOpts?: ParentOpts): any;
    static pause(queue: MinimalQueue, pause: boolean): Promise<any>;
    static remove(queue: MinimalQueue, jobId: string): Promise<any>;
    static extendLock(queue: MinimalQueue, jobId: string, token: string, duration: number): Promise<any>;
    static updateProgress(queue: MinimalQueue, job: Job, progress: number | object): Promise<void>;
    static moveToFinishedArgs(queue: MinimalQueue, job: Job, val: any, propVal: string, shouldRemove: boolean | number, target: string, token: string, fetchNext?: boolean): string[];
    static moveToFinished(queue: MinimalQueue, job: Job, val: any, propVal: string, shouldRemove: boolean | number, target: string, token: string, fetchNext: boolean): Promise<[] | [JobJsonRaw, string]>;
    static finishedErrors(code: number, jobId: string, command: string): Error;
    static moveToCompleted(queue: MinimalQueue, job: Job, returnvalue: any, removeOnComplete: boolean | number, token: string, fetchNext: boolean): Promise<[] | [JobJsonRaw, string]>;
    static moveToFailedArgs(queue: MinimalQueue, job: Job, failedReason: string, removeOnFailed: boolean | number, token: string, fetchNext?: boolean): string[];
    static isFinished(queue: MinimalQueue, jobId: string): Promise<any>;
    static getState(queue: MinimalQueue, jobId: string): Promise<any>;
    static moveToDelayedArgs(queue: MinimalQueue, jobId: string, timestamp: number): string[];
    static moveToDelayed(queue: MinimalQueue, jobId: string, timestamp: number): Promise<void>;
    static cleanJobsInSet(queue: MinimalQueue, set: string, timestamp: number, limit?: number): Promise<any>;
    static retryJobArgs(queue: MinimalQueue, job: Job): string[];
    /**
     * Attempts to reprocess a job
     *
     * @param {Job} job
     * @param {Object} options
     * @param {String} options.state The expected job state. If the job is not found
     * on the provided state, then it's not reprocessed. Supported states: 'failed', 'completed'
     *
     * @return {Promise<Number>} Returns a promise that evaluates to a return code:
     * 1 means the operation was a success
     * 0 means the job does not exist
     * -1 means the job is currently locked and can't be retried.
     * -2 means the job was not found in the expected set
     */
    static reprocessJob(queue: MinimalQueue, job: Job, state: 'failed' | 'completed'): Promise<any>;
    static moveToActive<T, R, N extends string>(worker: Worker<T, R, N>, token: string, jobId?: string): Promise<[] | [number, undefined] | [JobJsonRaw, string]>;
    static updateDelaySet(queue: MinimalQueue, delayedTimestamp: number): Promise<any>;
    static promote(queue: MinimalQueue, jobId: string): Promise<any>;
    static moveStalledJobsToWait(queue: QueueScheduler): Promise<any>;
    static obliterate(queue: MinimalQueue, opts: {
        force: boolean;
        count: number;
    }): Promise<any>;
}
