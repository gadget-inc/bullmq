import { JobsOptions, RedisClient } from '../interfaces';
import { QueueEvents } from './queue-events';
import { MinimalQueue, ParentOpts, JobData } from './scripts';
export declare type BulkJobOptions = Omit<JobsOptions, 'repeat'>;
export interface JobJson {
    id: string;
    name: string;
    data: string;
    opts: JobsOptions;
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
    parent?: string;
}
export interface MoveToChildrenOpts {
    timestamp?: number;
    child?: {
        id: string;
        queue: string;
    };
}
export interface DependenciesOpts {
    processed?: {
        cursor?: number;
        count?: number;
    };
    unprocessed?: {
        cursor?: number;
        count?: number;
    };
}
export declare class Job<DataType = any, ReturnType = any, NameType extends string = string> {
    protected queue: MinimalQueue;
    /**
     * The name of the Job
     */
    name: NameType;
    /**
     * The payload for this job.
     */
    data: DataType;
    /**
     * The options object for this job.
     */
    opts: JobsOptions;
    id?: string;
    /**
     * The progress a job has performed so far.
     * @defaultValue 0
     */
    progress: number | object;
    /**
     * The value returned by the processor when processing this job.
     * @defaultValue null
     */
    returnvalue: ReturnType;
    /**
     * Stacktrace for the error (for failed jobs).
     * @defaultValue null
     */
    stacktrace: string[];
    /**
     * Timestamp when the job was created (unless overridden with job options).
     */
    timestamp: number;
    /**
     * Number of attempts after the job has failed.
     * @defaultValue 0
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
    parent?: {
        id: string;
        queueKey: string;
    };
    protected toKey: (type: string) => string;
    private discarded;
    constructor(queue: MinimalQueue, 
    /**
     * The name of the Job
     */
    name: NameType, 
    /**
     * The payload for this job.
     */
    data: DataType, 
    /**
     * The options object for this job.
     */
    opts?: JobsOptions, id?: string);
    /**
     * Creates a new job and adds it to the queue.
     *
     * @param queue - the queue where to add the job.
     * @param name - the name of the job.
     * @param data - the payload of the job.
     * @param opts - the options bag for this job.
     * @returns
     */
    static create<T = any, R = any, N extends string = string>(queue: MinimalQueue, name: N, data: T, opts?: JobsOptions): Promise<Job<T, R, N>>;
    /**
     * Creates a bulk of jobs and adds them atomically to the given queue.
     *
     * @param queue -the queue were to add the jobs.
     * @param jobs - an array of jobs to be added to the queue.
     * @returns
     */
    static createBulk<T = any, R = any, N extends string = string>(queue: MinimalQueue, jobs: {
        name: N;
        data: T;
        opts?: BulkJobOptions;
    }[]): Promise<Job<T, R, N>[]>;
    /**
     * Instantiates a Job from a JobJsonRaw object (coming from a deserialized JSON object)
     *
     * @param queue - the queue where the job belongs to.
     * @param json - the plain object containing the job.
     * @param jobId - an optional job id (overrides the id coming from the JSON object)
     * @returns
     */
    static fromJSON(queue: MinimalQueue, json: JobJsonRaw, jobId?: string): Job<any, any, string>;
    /**
     * Fetches a Job from the queue given the passed job id.
     *
     * @param queue - the queue where the job belongs to.
     * @param jobId - the job id.
     * @returns
     */
    static fromId(queue: MinimalQueue, jobId: string): Promise<Job | undefined>;
    toJSON(): Omit<this, "remove" | "update" | "toJSON" | "discard" | "queue" | "asJSON" | "updateProgress" | "log" | "extendLock" | "moveToCompleted" | "moveToFailed" | "isCompleted" | "isFailed" | "isDelayed" | "isWaitingChildren" | "isActive" | "isWaiting" | "queueName" | "getState" | "changeDelay" | "getChildrenValues" | "getDependencies" | "getDependenciesCount" | "waitUntilFinished" | "moveToDelayed" | "moveToWaitingChildren" | "promote" | "retry" | "addJob">;
    /**
     * Prepares a job to be serialized for storage in Redis.
     * @returns
     */
    asJSON(): JobJson;
    /**
     * Updates a job's data
     *
     * @param data - the data that will replace the current jobs data.
     */
    update(data: DataType): Promise<void>;
    /**
     * Updates a job's progress
     *
     * @param progress - number or object to be saved as progress.
     */
    updateProgress(progress: number | object): Promise<void>;
    /**
     * Logs one row of log data.
     *
     * @param logRow - string with log data to be logged.
     */
    log(logRow: string): Promise<number>;
    /**
     * Completely remove the job from the queue.
     * Note, this call will throw an exception if the job
     * is being processed when the call is performed.
     */
    remove(): Promise<void>;
    /**
     * Extend the lock for this job.
     *
     * @param token - unique token for the lock
     * @param duration - lock duration in milliseconds
     */
    extendLock(token: string, duration: number): Promise<number>;
    /**
     * Moves a job to the completed queue.
     * Returned job to be used with Queue.prototype.nextJobFromJobData.
     *
     * @param returnValue - The jobs success message.
     * @param token - Worker token used to acquire completed job.
     * @param fetchNext - True when wanting to fetch the next job.
     * @returns Returns the jobData of the next job in the waiting queue.
     */
    moveToCompleted(returnValue: ReturnType, token: string, fetchNext?: boolean): Promise<JobData | []>;
    /**
     * Moves a job to the failed queue.
     *
     * @param err - the jobs error message.
     * @param token - token to check job is locked by current worker
     * @param fetchNext - true when wanting to fetch the next job
     * @returns void
     */
    moveToFailed(err: Error, token: string, fetchNext?: boolean): Promise<void>;
    /**
     * @returns true if the job has completed.
     */
    isCompleted(): Promise<boolean>;
    /**
     * @returns true if the job has failed.
     */
    isFailed(): Promise<boolean>;
    /**
     * @returns true if the job is delayed.
     */
    isDelayed(): Promise<boolean>;
    /**
     * @returns true if the job is waiting for children.
     */
    isWaitingChildren(): Promise<boolean>;
    /**
     * @returns true of the job is active.
     */
    isActive(): Promise<boolean>;
    /**
     * @returns true if the job is waiting.
     */
    isWaiting(): Promise<boolean>;
    get queueName(): string;
    /**
     * Get current state.
     *
     * @returns Returns one of these values:
     * 'completed', 'failed', 'delayed', 'active', 'waiting', 'waiting-children', 'unknown'.
     */
    getState(): Promise<string>;
    /**
     * Change delay of a delayed job.
     *
     * @param delay - milliseconds to be added to current time.
     * @returns void
     */
    changeDelay(delay: number): Promise<void>;
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
    getDependencies(opts?: DependenciesOpts): Promise<{
        nextProcessedCursor?: number;
        processed?: Record<string, any>;
        nextUnprocessedCursor?: number;
        unprocessed?: string[];
    }>;
    /**
     * Get children job counts if this job is a parent and has children.
     *
     * @returns dependencies count separated by processed and unprocessed.
     */
    getDependenciesCount(opts?: {
        processed?: boolean;
        unprocessed?: boolean;
    }): Promise<{
        processed?: number;
        unprocessed?: number;
    }>;
    /**
     * Returns a promise the resolves when the job has finished. (completed or failed).
     */
    waitUntilFinished(queueEvents: QueueEvents, ttl?: number): Promise<ReturnType>;
    /**
     * Moves the job to the delay set.
     *
     * @param timestamp - timestamp where the job should be moved back to "wait"
     * @returns
     */
    moveToDelayed(timestamp: number): Promise<void>;
    /**
     * Moves the job to the waiting-children set.
     *
     * @param token - Token to check job is locked by current worker
     * @param opts - The options bag for moving a job to waiting-children.
     * @returns true if the job was moved
     */
    moveToWaitingChildren(token: string, opts?: MoveToChildrenOpts): Promise<boolean | Error>;
    /**
     * Promotes a delayed job so that it starts to be processed as soon as possible.
     */
    promote(): Promise<void>;
    /**
     * Attempts to retry the job. Only a job that has failed can be retried.
     *
     * @returns If resolved and return code is 1, then the queue emits a waiting event
     * otherwise the operation was not a success and throw the corresponding error. If the promise
     * rejects, it indicates that the script failed to execute
     */
    retry(state?: 'completed' | 'failed'): Promise<void>;
    /**
     * Marks a job to not be retried if it fails (even if attempts has been configured)
     */
    discard(): void;
    private isInZSet;
    private isInList;
    /**
     * Adds the job to Redis.
     *
     * @param client -
     * @param parentOpts -
     * @returns
     */
    addJob(client: RedisClient, parentOpts?: ParentOpts): Promise<string>;
    private saveAttempt;
}
