import { QueueSchedulerOptions } from '../interfaces';
import { QueueBase } from './queue-base';
import { RedisConnection } from './redis-connection';
export interface QueueSchedulerListener {
    /**
     * Listen to 'stalled' event.
     *
     * This event is triggered when a job gets stalled.
     */
    stalled: (jobId: string, prev: string) => void;
    /**
     * Listen to 'failed' event.
     *
     * This event is triggered when a job has thrown an exception.
     */
    failed: (jobId: string, failedReason: Error, prev: string) => void;
}
/**
 * This class is just used for some automatic bookkeeping of the queue,
 * such as updating the delay set as well as moving stalled jobs back
 * to the waiting list.
 *
 * Jobs are checked for stallness once every "visibility window" seconds.
 * Jobs are then marked as candidates for being stalled, in the next check,
 * the candidates are marked as stalled and moved to wait.
 * Workers need to clean the candidate list with the jobs that they are working
 * on, failing to update the list results in the job ending being stalled.
 *
 * This class requires a dedicated redis connection, and at least one is needed
 * to be running at a given time, otherwise delays, stalled jobs, retries, repeatable
 * jobs, etc, will not work correctly or at all.
 *
 */
export declare class QueueScheduler extends QueueBase {
    private nextTimestamp;
    private isBlocked;
    private running;
    constructor(name: string, { connection, autorun, ...opts }?: QueueSchedulerOptions, Connection?: typeof RedisConnection);
    emit<U extends keyof QueueSchedulerListener>(event: U, ...args: Parameters<QueueSchedulerListener[U]>): boolean;
    off<U extends keyof QueueSchedulerListener>(eventName: U, listener: QueueSchedulerListener[U]): this;
    on<U extends keyof QueueSchedulerListener>(event: U, listener: QueueSchedulerListener[U]): this;
    once<U extends keyof QueueSchedulerListener>(event: U, listener: QueueSchedulerListener[U]): this;
    run(): Promise<void>;
    isRunning(): boolean;
    private readDelayedData;
    private updateDelaySet;
    private moveStalledJobsToWait;
    close(): Promise<void>;
}
