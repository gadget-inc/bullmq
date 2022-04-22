"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FlowProducer = void 0;
const events_1 = require("events");
const uuid_1 = require("uuid");
const utils_1 = require("../utils");
const job_1 = require("./job");
const queue_keys_1 = require("./queue-keys");
const redis_connection_1 = require("./redis-connection");
/**
 * This class allows to add jobs with dependencies between them in such
 * a way that it is possible to build complex flows.
 * Note: A flow is a tree-like structure of jobs that depend on each other.
 * Whenever the children of a given parent are completed, the parent
 * will be processed, being able to access the children's result data.
 * All Jobs can be in different queues, either children or parents,
 */
class FlowProducer extends events_1.EventEmitter {
    constructor(opts = {}) {
        super();
        this.opts = opts;
        this.opts = Object.assign({ prefix: 'bull' }, opts);
        this.connection = new redis_connection_1.RedisConnection(opts.connection);
        this.connection.on('error', this.emit.bind(this, 'error'));
        this.queueKeys = new queue_keys_1.QueueKeys(opts.prefix);
    }
    /**
     * Adds a flow.
     *
     * This call would be atomic, either it fails and no jobs will
     * be added to the queues, or it succeeds and all jobs will be added.
     *
     * @param flow - an object with a tree-like structure where children jobs
     * will be processed before their parents.
     * @param opts - options that will be applied to the flow object.
     */
    async add(flow, opts) {
        if (this.closing) {
            return;
        }
        const client = await this.connection.client;
        const multi = client.multi();
        const jobsTree = this.addNode({
            multi,
            node: flow,
            queuesOpts: opts === null || opts === void 0 ? void 0 : opts.queuesOptions,
        });
        await multi.exec();
        return jobsTree;
    }
    /**
     * Get a flow.
     *
     * @param opts - an object with options for getting a JobNode.
     */
    async getFlow(opts) {
        if (this.closing) {
            return;
        }
        const client = await this.connection.client;
        const updatedOpts = Object.assign({
            depth: 10,
            maxChildren: 20,
        }, opts);
        const jobsTree = this.getNode(client, updatedOpts);
        return jobsTree;
    }
    get client() {
        return this.connection.client;
    }
    /**
     * Adds multiple flows.
     *
     * A flow is a tree-like structure of jobs that depend on each other.
     * Whenever the children of a given parent are completed, the parent
     * will be processed, being able to access the children's result data.
     *
     * All Jobs can be in different queues, either children or parents,
     * however this call would be atomic, either it fails and no jobs will
     * be added to the queues, or it succeeds and all jobs will be added.
     *
     * @param flows - an array of objects with a tree-like structure where children jobs
     * will be processed before their parents.
     */
    async addBulk(flows) {
        if (this.closing) {
            return;
        }
        const client = await this.connection.client;
        const multi = client.multi();
        const jobsTrees = this.addNodes(multi, flows);
        await multi.exec();
        return jobsTrees;
    }
    /**
     * Add a node (job) of a flow to the queue. This method will recursively
     * add all its children as well. Note that a given job can potentially be
     * a parent and a child job at the same time depending on where it is located
     * in the tree hierarchy.
     *
     * @param multi - ioredis pipeline
     * @param node - the node representing a job to be added to some queue
     * @param parent - parent data sent to children to create the "links" to their parent
     * @returns
     */
    addNode({ multi, node, parent, queuesOpts }) {
        const queue = this.queueFromNode(node, new queue_keys_1.QueueKeys(node.prefix || this.opts.prefix));
        const queueOpts = queuesOpts && queuesOpts[node.queueName];
        const jobId = (0, utils_1.jobIdForGroup)(node.opts, node.data, queueOpts) || (0, uuid_1.v4)();
        const job = new job_1.Job(queue, node.name, node.data, Object.assign(Object.assign({}, node.opts), { parent: parent === null || parent === void 0 ? void 0 : parent.parentOpts }), jobId);
        const parentKey = (0, utils_1.getParentKey)(parent === null || parent === void 0 ? void 0 : parent.parentOpts);
        if (node.children && node.children.length > 0) {
            // Create parent job, will be a job in status "waiting-children".
            const parentId = jobId;
            const queueKeysParent = new queue_keys_1.QueueKeys(node.prefix || this.opts.prefix);
            const waitChildrenKey = queueKeysParent.toKey(node.queueName, 'waiting-children');
            job.addJob(multi, {
                parentDependenciesKey: parent === null || parent === void 0 ? void 0 : parent.parentDependenciesKey,
                waitChildrenKey,
                parentKey,
            });
            const parentDependenciesKey = `${queueKeysParent.toKey(node.queueName, parentId)}:dependencies`;
            const children = this.addChildren({
                multi,
                nodes: node.children,
                parent: {
                    parentOpts: {
                        id: parentId,
                        queue: queueKeysParent.getPrefixedQueueName(node.queueName),
                    },
                    parentDependenciesKey,
                },
                queuesOpts,
            });
            return { job, children };
        }
        else {
            job.addJob(multi, {
                parentDependenciesKey: parent === null || parent === void 0 ? void 0 : parent.parentDependenciesKey,
                parentKey,
            });
            return { job };
        }
    }
    /**
     * Adds nodes (jobs) of multiple flows to the queue. This method will recursively
     * add all its children as well. Note that a given job can potentially be
     * a parent and a child job at the same time depending on where it is located
     * in the tree hierarchy.
     *
     * @param multi - ioredis pipeline
     * @param nodes - the nodes representing jobs to be added to some queue
     * @returns
     */
    addNodes(multi, nodes) {
        return nodes.map(node => this.addNode({ multi, node }));
    }
    async getNode(client, node) {
        const queue = this.queueFromNode(node, new queue_keys_1.QueueKeys(node.prefix));
        const job = await job_1.Job.fromId(queue, node.id);
        if (job) {
            const { processed = {}, unprocessed = [] } = await job.getDependencies({
                processed: {
                    count: node.maxChildren,
                },
                unprocessed: {
                    count: node.maxChildren,
                },
            });
            const processedKeys = Object.keys(processed);
            const childrenCount = processedKeys.length + unprocessed.length;
            const newDepth = node.depth - 1;
            if (childrenCount > 0 && newDepth) {
                const children = await this.getChildren(client, [...processedKeys, ...unprocessed], newDepth, node.maxChildren);
                return { job, children };
            }
            else {
                return { job };
            }
        }
    }
    addChildren({ multi, nodes, parent, queuesOpts }) {
        return nodes.map(node => this.addNode({ multi, node, parent, queuesOpts }));
    }
    getChildren(client, childrenKeys, depth, maxChildren) {
        const getChild = (key) => {
            const [prefix, queueName, id] = key.split(':');
            return this.getNode(client, {
                id,
                queueName,
                prefix,
                depth,
                maxChildren,
            });
        };
        return Promise.all([...childrenKeys.map(getChild)]);
    }
    /**
     * Helper factory method that creates a queue-like object
     * required to create jobs in any queue.
     *
     * @param node -
     * @param queueKeys -
     * @returns
     */
    queueFromNode(node, queueKeys) {
        return {
            client: this.connection.client,
            name: node.queueName,
            keys: queueKeys.getKeys(node.queueName),
            toKey: (type) => queueKeys.toKey(node.queueName, type),
            opts: {},
            closing: this.closing,
            waitUntilReady: async () => this.connection.client,
            removeListener: this.removeListener.bind(this),
            emit: this.emit.bind(this),
            on: this.on.bind(this),
            redisVersion: this.connection.redisVersion,
        };
    }
    close() {
        if (!this.closing) {
            this.closing = this.connection.close();
        }
        return this.closing;
    }
    disconnect() {
        return this.connection.disconnect();
    }
}
exports.FlowProducer = FlowProducer;
//# sourceMappingURL=flow-producer.js.map