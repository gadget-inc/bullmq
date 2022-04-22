import { QueueBase } from './queue-base';
import { Job } from './job';
import { JobType } from '../types';
import { Metrics } from '../interfaces';
export declare class QueueGetters<DataType, ResultType, NameType extends string> extends QueueBase {
    getJob(jobId: string): Promise<Job<DataType, ResultType, NameType> | undefined>;
    private commandByType;
    private sanitizeJobTypes;
    /**
      Returns the number of jobs waiting to be processed.
    */
    count(): Promise<number>;
    /**
     * Job counts by type
     *
     * Queue#getJobCountByTypes('completed') => completed count
     * Queue#getJobCountByTypes('completed,failed') => completed + failed count
     * Queue#getJobCountByTypes('completed', 'failed') => completed + failed count
     * Queue#getJobCountByTypes('completed', 'waiting', 'failed') => completed + waiting + failed count
     */
    getJobCountByTypes(...types: JobType[]): Promise<number>;
    /**
     * Returns the job counts for each type specified or every list/set in the queue by default.
     *
     * @returns An object, key (type) and value (count)
     */
    getJobCounts(...types: JobType[]): Promise<{
        [index: string]: number;
    }>;
    /**
     * Returns the number of jobs in completed status.
     */
    getCompletedCount(): Promise<number>;
    /**
     * Returns the number of jobs in failed status.
     */
    getFailedCount(): Promise<number>;
    /**
     * Returns the number of jobs in delayed status.
     */
    getDelayedCount(): Promise<number>;
    /**
     * Returns the number of jobs in active status.
     */
    getActiveCount(): Promise<number>;
    /**
     * Returns the number of jobs in waiting or paused statuses.
     */
    getWaitingCount(): Promise<number>;
    /**
     * Returns the number of jobs in waiting-children status.
     */
    getWaitingChildrenCount(): Promise<number>;
    getWaiting(start?: number, end?: number): Promise<Job<DataType, ResultType, NameType>[]>;
    getWaitingChildren(start?: number, end?: number): Promise<Job<DataType, ResultType, NameType>[]>;
    getActive(start?: number, end?: number): Promise<Job<DataType, ResultType, NameType>[]>;
    getDelayed(start?: number, end?: number): Promise<Job<DataType, ResultType, NameType>[]>;
    getCompleted(start?: number, end?: number): Promise<Job<DataType, ResultType, NameType>[]>;
    getFailed(start?: number, end?: number): Promise<Job<DataType, ResultType, NameType>[]>;
    getRanges(types: JobType[], start?: number, end?: number, asc?: boolean): Promise<string[]>;
    getJobs(types?: JobType[] | JobType, start?: number, end?: number, asc?: boolean): Promise<Job<DataType, ResultType, NameType>[]>;
    getJobLogs(jobId: string, start?: number, end?: number, asc?: boolean): Promise<{
        logs: [string];
        count: number;
    }>;
    private baseGetClients;
    /**
     * Get worker list related to the queue.
     *
     * @returns - Returns an array with workers info.
     */
    getWorkers(): Promise<{
        [index: string]: string;
    }[]>;
    /**
     * Get queue schedulers list related to the queue.
     *
     * @returns - Returns an array with queue schedulers info.
     */
    getQueueSchedulers(): Promise<{
        [index: string]: string;
    }[]>;
    /**
     * Get queue events list related to the queue.
     *
     * @returns - Returns an array with queue events info.
     */
    getQueueEvents(): Promise<{
        [index: string]: string;
    }[]>;
    /**
     * Get queue metrics related to the queue.
     *
     * This method returns the gathered metrics for the queue.
     * The metrics are represented as an array of job counts
     * per unit of time (1 minute).
     *
     * @param start - Start point of the metrics, where 0
     * is the newest point to be returned.
     * @param end - End point of the metrics, where -1 is the
     * oldest point to be returned.
     *
     * @returns - Returns an object with queue metrics.
     */
    getMetrics(type: 'completed' | 'failed', start?: number, end?: number): Promise<Metrics>;
    private parseClientList;
}
