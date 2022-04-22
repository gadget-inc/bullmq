import { Processor, WorkerOptions, GetNextJobOptions, RedisClient } from '../interfaces';
import { QueueBase } from './queue-base';
import { Repeat } from './repeat';
import { Job, JobJsonRaw } from './job';
import { RedisConnection } from './redis-connection';
import { TimerManager } from './timer-manager';
export interface WorkerListener {
    /**
     * Listen to 'active' event.
     *
     * This event is triggered when a job enters the 'active' state.
     */
    active: (job: Job, prev: string) => void;
    /**
     * Listen to 'closing' event.
     *
     * This event is triggered when the worker is closed.
     */
    closed: () => void;
    /**
     * Listen to 'closing' event.
     *
     * This event is triggered when the worker is closing.
     */
    closing: (msg: string) => void;
    /**
     * Listen to 'completed' event.
     *
     * This event is triggered when a job has successfully completed.
     */
    completed: (job: Job, result: any, prev: string) => void;
    /**
     * Listen to 'drained' event.
     *
     * This event is triggered when the queue has drained the waiting list.
     * Note that there could still be delayed jobs waiting their timers to expire
     * and this event will still be triggered as long as the waiting list has emptied.
     */
    drained: () => void;
    /**
     * Listen to 'error' event.
     *
     * This event is triggered when an error is throw.
     */
    error: (failedReason: Error) => void;
    /**
     * Listen to 'failed' event.
     *
     * This event is triggered when a job has thrown an exception.
     */
    failed: (job: Job, error: Error, prev: string) => void;
    /**
     * Listen to 'paused' event.
     *
     * This event is triggered when the queue is paused.
     */
    paused: () => void;
    /**
     * Listen to 'progress' event.
     *
     * This event is triggered when a job updates it progress, i.e. the
     * Job##updateProgress() method is called. This is useful to notify
     * progress or any other data from within a processor to the rest of the
     * world.
     */
    progress: (job: Job, progress: number | object) => void;
    /**
     * Listen to 'resumed' event.
     *
     * This event is triggered when the queue is resumed.
     */
    resumed: () => void;
}
/**
 *
 * This class represents a worker that is able to process jobs from the queue.
 * As soon as the class is instantiated it will start processing jobs.
 *
 */
export declare class Worker<DataType = any, ResultType = any, NameType extends string = string> extends QueueBase {
    opts: WorkerOptions;
    private drained;
    private waiting;
    private running;
    private blockTimeout;
    protected processFn: Processor<DataType, ResultType, NameType>;
    private resumeWorker;
    protected paused: Promise<void>;
    private _repeat;
    private childPool;
    protected timerManager: TimerManager;
    private blockingConnection;
    private processing;
    constructor(name: string, processor?: string | Processor<DataType, ResultType, NameType>, opts?: WorkerOptions, Connection?: typeof RedisConnection);
    emit<U extends keyof WorkerListener>(event: U, ...args: Parameters<WorkerListener[U]>): boolean;
    off<U extends keyof WorkerListener>(eventName: U, listener: WorkerListener[U]): this;
    on<U extends keyof WorkerListener>(event: U, listener: WorkerListener[U]): this;
    once<U extends keyof WorkerListener>(event: U, listener: WorkerListener[U]): this;
    protected callProcessJob(job: Job<DataType, ResultType, NameType>, token: string): Promise<ResultType>;
    protected createJob(data: JobJsonRaw, jobId: string): Job<any, any, string>;
    /**
     *
     * Waits until the worker is ready to start processing jobs.
     * In general only useful when writing tests.
     *
     */
    waitUntilReady(): Promise<RedisClient>;
    get repeat(): Promise<Repeat>;
    run(): Promise<any[]>;
    /**
     * Returns a promise that resolves to the next job in queue.
     * @param token - worker token to be assigned to retrieved job
     * @returns a Job or undefined if no job was available in the queue.
     */
    getNextJob(token: string, { block }?: GetNextJobOptions): Promise<Job<any, any, string>>;
    protected moveToActive(token: string, jobId?: string): Promise<Job<any, any, string>>;
    private waitForJob;
    /**
     *
     * This function is exposed only for testing purposes.
     */
    delay(): Promise<void>;
    protected nextJobFromJobData(jobData?: JobJsonRaw | number, jobId?: string): Promise<Job<any, any, string>>;
    processJob(job: Job<DataType, ResultType, NameType>, token: string): Promise<void | Job<any, any, string>>;
    /**
     *
     * Pauses the processing of this queue only for this worker.
     */
    pause(doNotWaitActive?: boolean): Promise<void>;
    /**
     *
     * Resumes processing of this worker (if paused).
     */
    resume(): void;
    /**
     *
     * Checks if worker is paused.
     *
     * @returns true if worker is paused, false otherwise.
     */
    isPaused(): boolean;
    /**
     *
     * Checks if worker is currently running.
     *
     * @returns true if worker is running, false otherwise.
     */
    isRunning(): boolean;
    /**
     *
     * Closes the worker and related redis connections.
     *
     * This method waits for current jobs to finalize before returning.
     *
     * @param force - Use force boolean parameter if you do not want to wait for
     * current jobs to be processed.
     *
     * @returns Promise that resolves when the worker has been closed.
     */
    close(force?: boolean): Promise<void>;
    /**
     * Returns a promise that resolves when active jobs are cleared
     *
     * @returns
     */
    private whenCurrentJobsFinished;
    private retryIfFailed;
}
