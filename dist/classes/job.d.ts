import { JobsOptions } from '../interfaces';
import { QueueEvents } from './queue-events';
import { MinimalQueue, ParentOpts } from './scripts';
import { RedisClient } from './redis-connection';
export declare type BulkJobOptions = Omit<JobsOptions, 'repeat'>;
export interface JobJson {
    id: string;
    name: string;
    data: string;
    opts: string;
    progress: number | object;
    attemptsMade: number;
    finishedOn?: number;
    processedOn?: number;
    timestamp: number;
    failedReason: string;
    stacktrace: string;
    returnvalue: string;
    parentKey?: string;
}
export interface JobJsonRaw {
    id: string;
    name: string;
    data: string;
    opts: string;
    progress: string;
    attemptsMade: string;
    finishedOn?: string;
    processedOn?: string;
    timestamp: string;
    failedReason: string;
    stacktrace: string[];
    returnvalue: string;
    parentKey?: string;
}
export declare class Job<T = any, R = any, N extends string = string> {
    private queue;
    name: N;
    data: T;
    opts: JobsOptions;
    id?: string;
    /**
     * The progress a job has performed so far.
     */
    progress: number | object;
    /**
     * The value returned by the processor when processing this job.
     */
    returnvalue: R;
    /**
     * Stacktrace for the error (for failed jobs).
     */
    stacktrace: string[];
    /**
     * Timestamp when the job was created (unless overrided with job options).
     */
    timestamp: number;
    /**
     * Number of attempts after the job has failed.
     */
    attemptsMade: number;
    /**
     * Reason for failing.
     */
    failedReason: string;
    /**
     * Timestamp for when the job finished (completed or failed).
     */
    finishedOn?: number;
    /**
     * Timestamp for when the job was processed.
     */
    processedOn?: number;
    /**
     * Fully qualified key (including the queue prefix) pointing to the parent of this job.
     */
    parentKey?: string;
    private toKey;
    private discarded;
    constructor(queue: MinimalQueue, name: N, data: T, opts?: JobsOptions, id?: string);
    static create<T = any, R = any, N extends string = string>(queue: MinimalQueue, name: N, data: T, opts?: JobsOptions): Promise<Job<T, R, N>>;
    static createBulk<T = any, R = any, N extends string = string>(queue: MinimalQueue, jobs: {
        name: N;
        data: T;
        opts?: BulkJobOptions;
    }[]): Promise<Job<T, R, N>[]>;
    static fromJSON(queue: MinimalQueue, json: JobJsonRaw, jobId?: string): Job<any, any, string>;
    static fromId(queue: MinimalQueue, jobId: string): Promise<Job | undefined>;
    toJSON(): Pick<this, Exclude<keyof this, "queue">>;
    asJSON(): JobJson;
    update(data: T): Promise<void>;
    updateProgress(progress: number | object): Promise<void>;
    /**
     * Logs one row of log data.
     *
     * @params logRow: string String with log data to be logged.
     *
     */
    log(logRow: string): Promise<number>;
    remove(): Promise<void>;
    /**
     * Extend the lock for this job.
     *
     * @param token unique token for the lock
     * @param duration lock duration in milliseconds
     */
    extendLock(token: string, duration: number): Promise<any>;
    /**
     * Moves a job to the completed queue.
     * Returned job to be used with Queue.prototype.nextJobFromJobData.
     * @param returnValue {string} The jobs success message.
     * @param fetchNext {boolean} True when wanting to fetch the next job
     * @returns {Promise} Returns the jobData of the next job in the waiting queue.
     */
    moveToCompleted(returnValue: R, token: string, fetchNext?: boolean): Promise<[JobJsonRaw, string] | []>;
    /**
     * Moves a job to the failed queue.
     * @param err {Error} The jobs error message.
     * @param token {string} Token to check job is locked by current worker
     * @param fetchNext {boolean} True when wanting to fetch the next job
     * @returns void
     */
    moveToFailed(err: Error, token: string, fetchNext?: boolean): Promise<void>;
    isCompleted(): Promise<boolean>;
    isFailed(): Promise<boolean>;
    isDelayed(): Promise<boolean>;
    isWaitingChildren(): Promise<boolean>;
    isActive(): Promise<boolean>;
    isWaiting(): Promise<boolean>;
    /**
     * Get current state.
     * @method
     * @returns {string} Returns one of these values:
     * 'completed', 'failed', 'delayed', 'active', 'waiting', 'waiting-children', 'unknown'.
     */
    getState(): Promise<any>;
    /**
     * Get this jobs children result values if any.
     *
     * @returns Object mapping children job keys with their values.
     */
    getChildrenValues<CT = any>(): Promise<{
        [jobKey: string]: CT;
    }>;
    /**
     * Get children job keys if this job is a parent and has children.
     *
     * @returns dependencies separated by processed and unprocessed.
     */
    getDependencies(): Promise<{
        processed: {
            [jobKey: string]: string;
        };
        unprocessed: string[];
    }>;
    /**
     * Returns a promise the resolves when the job has finished. (completed or failed).
     */
    waitUntilFinished(queueEvents: QueueEvents, ttl?: number): Promise<R>;
    moveToDelayed(timestamp: number): Promise<void>;
    promote(): Promise<void>;
    /**
     * Attempts to retry the job. Only a job that has failed can be retried.
     *
     * @return {Promise} If resolved and return code is 1, then the queue emits a waiting event
     * otherwise the operation was not a success and throw the corresponding error. If the promise
     * rejects, it indicates that the script failed to execute
     */
    retry(state?: 'completed' | 'failed'): Promise<void>;
    discard(): void;
    private isInZSet;
    private isInList;
    addJob(client: RedisClient, parentOpts?: ParentOpts): string;
    private saveAttempt;
}
