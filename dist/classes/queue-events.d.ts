import { QueueEventsOptions } from '../interfaces';
import { QueueBase } from './queue-base';
export declare interface QueueEvents {
    on(event: 'active', listener: (args: {
        jobId: string;
    }, prev?: string) => void): this;
    on(event: 'waiting', listener: (args: {
        jobId: string;
    }, id: string) => void): this;
    on(event: 'delayed', listener: (args: {
        jobId: string;
        delay: number;
    }, id: string) => void): this;
    on(event: 'progress', listener: (args: {
        jobId: string;
        data: string;
    }, id: string) => void): this;
    on(event: 'stalled', listener: (args: {
        jobId: string;
    }, id: string) => void): this;
    on(event: 'completed', listener: (args: {
        jobId: string;
        returnvalue: string;
        prev?: string;
    }, id: string) => void): this;
    on(event: 'failed', listener: (args: {
        jobId: string;
        failedReason: string;
        prev?: string;
    }, id: string) => void): this;
    on(event: 'removed', listener: (args: {
        jobId: string;
    }, id: string) => void): this;
    on(event: 'drained', listener: (id: string) => void): this;
    on(event: string, listener: Function): this;
}
export declare class QueueEvents extends QueueBase {
    constructor(name: string, opts?: QueueEventsOptions);
    private consumeEvents;
    close(): Promise<void>;
}
