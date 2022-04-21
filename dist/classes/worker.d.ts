import { Processor, WorkerOptions, GetNextJobOptions } from '../interfaces';
import { QueueBase, Repeat } from './';
import { Job } from './job';
import { RedisClient } from './redis-connection';
export declare const clientCommandMessageReg: RegExp;
export declare class Worker<T = any, R = any, N extends string = string> extends QueueBase {
    opts: WorkerOptions;
    private drained;
    private waiting;
    private processFn;
    private resumeWorker;
    private paused;
    private _repeat;
    private childPool;
    private timerManager;
    private blockingConnection;
    private processing;
    constructor(name: string, processor?: string | Processor<T, R, N>, opts?: WorkerOptions);
    waitUntilReady(): Promise<RedisClient>;
    get repeat(): Promise<Repeat>;
    private run;
    /**
     * Returns a promise that resolves to the next job in queue.
     * @param token worker token to be assigned to retrieved job
     * @returns a Job or undefined if no job was available in the queue.
     */
    getNextJob(token: string, { block }?: GetNextJobOptions): Promise<Job<any, any, string>>;
    private moveToActive;
    private waitForJob;
    private nextJobFromJobData;
    processJob(job: Job<T, R, N>, token: string): Promise<void | Job<any, any, string>>;
    /**
     * Pauses the processing of this queue only for this worker.
     */
    pause(doNotWaitActive?: boolean): Promise<void>;
    resume(): void;
    isPaused(): boolean;
    /**
     * Returns a promise that resolves when active jobs are cleared
     *
     * @returns {Promise}
     */
    private whenCurrentJobsFinished;
    close(force?: boolean): Promise<void>;
}
