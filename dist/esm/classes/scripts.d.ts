/**
 * Includes all the scripts needed by the queue and jobs.
 */
import { JobsOptions, RedisClient } from '../interfaces';
import { Worker } from './worker';
import { QueueScheduler } from './queue-scheduler';
import { QueueBase } from './queue-base';
import { Job, JobJson, JobJsonRaw, MoveToChildrenOpts } from './job';
export declare type MinimalQueue = Pick<QueueBase, 'name' | 'client' | 'toKey' | 'keys' | 'opts' | 'closing' | 'waitUntilReady' | 'removeListener' | 'emit' | 'on' | 'redisVersion'>;
export declare type ParentOpts = {
    waitChildrenKey?: string;
    parentDependenciesKey?: string;
    parentKey?: string;
};
export declare type JobData = [JobJsonRaw | number, string?];
export declare class Scripts {
    static isJobInList(queue: MinimalQueue, listKey: string, jobId: string): Promise<boolean>;
    static addJob(client: RedisClient, queue: MinimalQueue, job: JobJson, opts: JobsOptions, jobId: string, parentOpts?: ParentOpts): Promise<string>;
    static pause(queue: MinimalQueue, pause: boolean): Promise<void>;
    static removeRepeatableArgs(queue: MinimalQueue, repeatJobId: string, repeatJobKey: string): string[];
    static removeRepeatable(queue: MinimalQueue, repeatJobId: string, repeatJobKey: string): Promise<void>;
    static remove(queue: MinimalQueue, jobId: string): Promise<number>;
    static extendLock(queue: MinimalQueue, jobId: string, token: string, duration: number): Promise<number>;
    static updateProgress(queue: MinimalQueue, job: Job, progress: number | object): Promise<void>;
    static moveToFinishedArgs(queue: MinimalQueue, job: Job, val: any, propVal: string, shouldRemove: boolean | number, target: string, token: string, fetchNext?: boolean): string[];
    private static moveToFinished;
    static finishedErrors(code: number, jobId: string, command: string, state?: string): Error;
    static drainArgs(queue: MinimalQueue, delayed: boolean): string[];
    static drain(queue: MinimalQueue, delayed: boolean): Promise<void>;
    static moveToCompleted(queue: MinimalQueue, job: Job, returnvalue: any, removeOnComplete: boolean | number, token: string, fetchNext: boolean): Promise<JobData | []>;
    static moveToFailedArgs(queue: MinimalQueue, job: Job, failedReason: string, removeOnFailed: boolean | number, token: string, fetchNext?: boolean): string[];
    static isFinished(queue: MinimalQueue, jobId: string, returnValue?: boolean): Promise<number | [number, string]>;
    static getState(queue: MinimalQueue, jobId: string): Promise<string>;
    static changeDelay(queue: MinimalQueue, jobId: string, delay: number): Promise<void>;
    static changeDelayArgs(queue: MinimalQueue, jobId: string, timestamp: number): string[];
    static moveToDelayedArgs(queue: MinimalQueue, jobId: string, timestamp: number): string[];
    static moveToWaitingChildrenArgs(queue: MinimalQueue, jobId: string, token: string, opts?: MoveToChildrenOpts): string[];
    static moveToDelayed(queue: MinimalQueue, jobId: string, timestamp: number): Promise<void>;
    /**
     * Move parent job to waiting-children state.
     *
     * @returns true if job is successfully moved, false if there are pending dependencies.
     * @throws JobNotExist
     * This exception is thrown if jobId is missing.
     * @throws JobLockNotExist
     * This exception is thrown if job lock is missing.
     * @throws JobNotInState
     * This exception is thrown if job is not in active state.
     */
    static moveToWaitingChildren(queue: MinimalQueue, jobId: string, token: string, opts?: MoveToChildrenOpts): Promise<boolean>;
    /**
     * Remove jobs in a specific state.
     *
     * @returns Id jobs from the deleted records.
     */
    static cleanJobsInSet(queue: MinimalQueue, set: string, timestamp: number, limit?: number): Promise<string[]>;
    static retryJobArgs(queue: MinimalQueue, job: Job): string[];
    /**
     * Attempts to reprocess a job
     *
     * @param job -
     * @param {Object} options
     * @param {String} options.state The expected job state. If the job is not found
     * on the provided state, then it's not reprocessed. Supported states: 'failed', 'completed'
     *
     * @returns Returns a promise that evaluates to a return code:
     * 1 means the operation was a success
     * 0 means the job does not exist
     * -1 means the job is currently locked and can't be retried.
     * -2 means the job was not found in the expected set
     */
    static reprocessJob(queue: MinimalQueue, job: Job, state: 'failed' | 'completed'): Promise<void>;
    static moveToActive<T, R, N extends string>(worker: Worker<T, R, N>, token: string, jobId?: string): Promise<[] | [number | JobJsonRaw, string?]>;
    static updateDelaySet(queue: MinimalQueue, delayedTimestamp: number): Promise<any>;
    static promote(queue: MinimalQueue, jobId: string): Promise<any>;
    static moveStalledJobsToWait(queue: QueueScheduler): Promise<any>;
    static obliterate(queue: MinimalQueue, opts: {
        force: boolean;
        count: number;
    }): Promise<number>;
}
export declare function raw2jobData(raw: any[]): [JobJsonRaw | number, string?] | [];
