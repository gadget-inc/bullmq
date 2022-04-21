/// <reference types="node" />
import { EventEmitter } from 'events';
import { QueueBaseOptions } from '../interfaces';
import { RedisConnection } from './redis-connection';
import { KeysMap, QueueKeys } from './queue-keys';
import { FlowJob } from '../interfaces/flow-job';
import { Job } from './job';
export interface JobNode {
    job: Job;
    children?: JobNode[];
}
/**
 * This class allows to add jobs into one or several queues
 * with dependencies between them in such a way that it is possible
 * to build complex flows.
 */
export declare class FlowProducer extends EventEmitter {
    opts: QueueBaseOptions;
    toKey: (name: string, type: string) => string;
    keys: KeysMap;
    closing: Promise<void>;
    queueKeys: QueueKeys;
    protected connection: RedisConnection;
    constructor(opts?: QueueBaseOptions);
    /**
     * Adds a flow.
     *
     * A flow is a tree-like structure of jobs that depend on each other.
     * Whenever the children of a given parent are completed, the parent
     * will be processed, being able to access the children's result data.
     *
     * All Jobs can be in different queues, either children or parents,
     * however this call would be atomic, either it fails and no jobs will
     * be added to the queues, or it succeeds and all jobs will be added.
     *
     * @param flow An object with a tree-like structure where children jobs
     * will be processed before their parents.
     */
    add(flow: FlowJob): Promise<JobNode>;
    /**
     * Add a node (job) of a flow to the queue. This method will recursively
     * add all its children as well. Note that a given job can potentially be
     * a parent and a child job at the same time depending on where it is located
     * in the tree hierarchy.
     *
     * @param multi ioredis pipeline
     * @param node the node representing a job to be added to some queue
     * @param parent Parent data sent to children to create the "links" to their parent
     * @returns
     */
    private addNode;
    private addChildren;
    /**
     * Helper factory method that creates a queue-like object
     * required to create jobs in any queue.
     *
     * @param node
     * @param queueKeys
     * @returns
     */
    private queueFromNode;
    close(): Promise<void>;
    disconnect(): Promise<void>;
}
export declare function getParentKey(opts: {
    id: string;
    queue: string;
}): string;
