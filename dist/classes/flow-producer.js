"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getParentKey = exports.FlowProducer = void 0;
const uuid = require("uuid");
const events_1 = require("events");
const redis_connection_1 = require("./redis-connection");
const queue_keys_1 = require("./queue-keys");
const job_1 = require("./job");
/**
 * This class allows to add jobs into one or several queues
 * with dependencies between them in such a way that it is possible
 * to build complex flows.
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
    async add(flow) {
        if (this.closing) {
            return;
        }
        const client = await this.connection.client;
        const multi = client.multi();
        const jobsTree = this.addNode(multi, flow);
        const result = await multi.exec();
        const updateJobIds = (jobsTree, result, index) => {
            // TODO: Can we safely ignore result errors? how could they happen in the
            // first place?
            jobsTree.job.id = result[index][1];
            const children = jobsTree.children;
            if (children) {
                for (let i = 0; i < children.length; i++) {
                    updateJobIds(children[i], result, index + i + 1);
                }
            }
        };
        updateJobIds(jobsTree, result, 0);
        return jobsTree;
    }
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
    addNode(multi, node, parent) {
        var _a;
        const queue = this.queueFromNode(node, new queue_keys_1.QueueKeys(node.prefix));
        const jobId = ((_a = node.opts) === null || _a === void 0 ? void 0 : _a.jobId) || uuid.v4();
        const job = new job_1.Job(queue, node.name, node.data, Object.assign(Object.assign({}, node.opts), { parent: parent === null || parent === void 0 ? void 0 : parent.parentOpts }), jobId);
        const parentKey = getParentKey(parent === null || parent === void 0 ? void 0 : parent.parentOpts);
        if (node.children && node.children.length > 0) {
            // Create parent job, will be a job in status "waiting-children".
            const parentId = jobId;
            const queueKeysParent = new queue_keys_1.QueueKeys(node.prefix);
            const waitChildrenKey = queueKeysParent.toKey(node.queueName, 'waiting-children');
            job.addJob(multi, {
                parentDependenciesKey: parent === null || parent === void 0 ? void 0 : parent.parentDependenciesKey,
                waitChildrenKey,
                parentKey,
            });
            const parentDependenciesKey = `${queueKeysParent.toKey(node.queueName, parentId)}:dependencies`;
            const children = this.addChildren(multi, node.children, {
                parentOpts: {
                    id: parentId,
                    queue: queueKeysParent.getPrefixedQueueName(node.queueName),
                },
                parentDependenciesKey,
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
    addChildren(multi, nodes, parent) {
        return nodes.map(node => this.addNode(multi, node, parent));
    }
    /**
     * Helper factory method that creates a queue-like object
     * required to create jobs in any queue.
     *
     * @param node
     * @param queueKeys
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
function getParentKey(opts) {
    if (opts) {
        return `${opts.queue}:${opts.id}`;
    }
}
exports.getParentKey = getParentKey;
//# sourceMappingURL=flow-producer.js.map