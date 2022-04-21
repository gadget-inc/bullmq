import { JobsOptions, QueueOptions, RepeatOptions } from '../interfaces';
import { Repeat } from './repeat';
import { QueueGetters } from './queue-getters';
import { BulkJobOptions, Job } from './job';
export declare class Queue<T = any, R = any, N extends string = string> extends QueueGetters {
    token: string;
    jobsOpts: JobsOptions;
    limiter: {
        groupKey: string;
    };
    private _repeat;
    constructor(name: string, opts?: QueueOptions);
    get defaultJobOptions(): JobsOptions;
    get repeat(): Promise<Repeat>;
    add(name: N, data: T, opts?: JobsOptions): Promise<Job<T, R, N>>;
    private jobIdForGroup;
    /**
     * Adds an array of jobs to the queue.
     * @method add
     * @param jobs: [] The array of jobs to add to the queue. Each job is defined by 3
     * properties, 'name', 'data' and 'opts'. They follow the same signature as 'Queue.add'.
     */
    addBulk(jobs: {
        name: N;
        data: T;
        opts?: BulkJobOptions;
    }[]): Promise<Job<T, any, N>[]>;
    /**
      Pauses the processing of this queue globally.
  
      We use an atomic RENAME operation on the wait queue. Since
      we have blocking calls with BRPOPLPUSH on the wait queue, as long as the queue
      is renamed to 'paused', no new jobs will be processed (the current ones
      will run until finalized).
  
      Adding jobs requires a LUA script to check first if the paused list exist
      and in that case it will add it there instead of the wait list.
    */
    pause(): Promise<void>;
    resume(): Promise<void>;
    isPaused(): Promise<boolean>;
    getRepeatableJobs(start?: number, end?: number, asc?: boolean): Promise<{
        key: string;
        name: string;
        id: string;
        endDate: number;
        tz: string;
        cron: string;
        next: number;
    }[]>;
    removeRepeatable(name: N, repeatOpts: RepeatOptions, jobId?: string): Promise<any>;
    removeRepeatableByKey(key: string): Promise<any>;
    /**
     * Removes the given job from the queue as well as all its
     * dependencies.
     *
     * @param jobId The if of the job to remove
     * @returns 1 if it managed to remove the job or -1 if the job or
     * any of its dependencies was locked.
     */
    remove(jobId: string): Promise<any>;
    /**
     * Drains the queue, i.e., removes all jobs that are waiting
     * or delayed, but not active, completed or failed.
     *
     * TODO: Convert to an atomic LUA script.
     */
    drain(delayed?: boolean): Promise<[Error, any][]>;
    /**
     * @method clean
     *
     * Cleans jobs from a queue. Similar to drain but keeps jobs within a certain
     * grace period.
     *
     * @param {number} grace - The grace period
     * @param {number} The max number of jobs to clean
     * @param {string} [type=completed] - The type of job to clean
     * Possible values are completed, wait, active, paused, delayed, failed. Defaults to completed.
     */
    clean(grace: number, limit: number, type?: 'completed' | 'wait' | 'active' | 'paused' | 'delayed' | 'failed'): Promise<any>;
    /**
     * @method obliterate
     *
     * Completely destroys the queue and all of its contents irreversibly.
     * This method will the *pause* the queue and requires that there are no
     * active jobs. It is possible to bypass this requirement, i.e. not
     * having active jobs using the "force" option.
     *
     * Note: This operation requires to iterate on all the jobs stored in the queue
     * and can be slow for very large queues.
     *
     * @param { { force: boolean, count: number }} opts. Use force = true to force obliteration even
     * with active jobs in the queue. Use count with the maximum number of deleted keys per iteration,
     * 1000 is the default.
     */
    obliterate(opts?: {
        force?: boolean;
        count?: number;
    }): Promise<void>;
    trimEvents(maxLength: number): Promise<number>;
}
