"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Worker = exports.clientCommandMessageReg = void 0;
const fs = require("fs");
const path = require("path");
const _1 = require("./");
const child_pool_1 = require("./child-pool");
const job_1 = require("./job");
const redis_connection_1 = require("./redis-connection");
const sandbox_1 = require("./sandbox");
const scripts_1 = require("./scripts");
const uuid_1 = require("uuid");
const timer_manager_1 = require("./timer-manager");
const utils_1 = require("../utils");
// note: sandboxed processors would also like to define concurrency per process
// for better resource utilization.
exports.clientCommandMessageReg = /ERR unknown command ['`]\s*client\s*['`]/;
class Worker extends _1.QueueBase {
    constructor(name, processor, opts = {}) {
        super(name, opts);
        this.waiting = false;
        this.opts = Object.assign({ 
            // settings: {},
            drainDelay: 5, concurrency: 1, lockDuration: 30000 }, this.opts);
        this.opts.lockRenewTime =
            this.opts.lockRenewTime || this.opts.lockDuration / 2;
        this.blockingConnection = new redis_connection_1.RedisConnection(utils_1.isRedisInstance(opts.connection)
            ? opts.connection.duplicate()
            : opts.connection);
        this.blockingConnection.on('error', this.emit.bind(this, 'error'));
        if (processor) {
            if (typeof processor === 'function') {
                this.processFn = processor;
            }
            else {
                // SANDBOXED
                const supportedFileTypes = ['.js', '.ts', '.flow'];
                const processorFile = processor +
                    (supportedFileTypes.includes(path.extname(processor)) ? '' : '.js');
                if (!fs.existsSync(processorFile)) {
                    // TODO are we forced to use sync api here?
                    throw new Error(`File ${processorFile} does not exist`);
                }
                this.childPool = this.childPool || new child_pool_1.ChildPool();
                this.processFn = sandbox_1.default(processor, this.childPool).bind(this);
            }
            this.timerManager = new timer_manager_1.TimerManager();
            /* tslint:disable: no-floating-promises */
            this.run().catch(error => {
                console.error(error);
            });
        }
        this.on('error', err => console.error(err));
    }
    async waitUntilReady() {
        await super.waitUntilReady();
        return this.blockingConnection.client;
    }
    get repeat() {
        return new Promise(async (resolve) => {
            if (!this._repeat) {
                const connection = await this.client;
                this._repeat = new _1.Repeat(this.name, Object.assign(Object.assign({}, this.opts), { connection }));
                this._repeat.on('error', e => this.emit.bind(this, e));
            }
            resolve(this._repeat);
        });
    }
    async run() {
        const client = await this.blockingConnection.client;
        if (this.closing) {
            return;
        }
        // IDEA, How to store metadata associated to a worker.
        // create a key from the worker ID associated to the given name.
        // We keep a hash table bull:myqueue:workers where
        // every worker is a hash key workername:workerId with json holding
        // metadata of the worker. The worker key gets expired every 30 seconds or so, we renew the worker metadata.
        //
        try {
            await client.client('setname', this.clientName());
        }
        catch (err) {
            if (!exports.clientCommandMessageReg.test(err.message)) {
                throw err;
            }
        }
        const opts = this.opts;
        const processing = (this.processing = new Map());
        const tokens = Array.from({ length: opts.concurrency }, () => uuid_1.v4());
        while (!this.closing) {
            if (processing.size < opts.concurrency) {
                const token = tokens.pop();
                processing.set(this.getNextJob(token), token);
            }
            /*
             * Get the first promise that completes
             */
            const promises = [...processing.keys()];
            const completedIdx = await Promise.race(promises.map((p, idx) => p.then(() => idx)));
            const completed = promises[completedIdx];
            const token = processing.get(completed);
            processing.delete(completed);
            const job = await completed;
            if (job) {
                // reuse same token if next job is available to process
                processing.set(this.processJob(job, token), token);
            }
            else {
                tokens.push(token);
            }
        }
        return Promise.all(processing);
    }
    /**
     * Returns a promise that resolves to the next job in queue.
     * @param token worker token to be assigned to retrieved job
     * @returns a Job or undefined if no job was available in the queue.
     */
    async getNextJob(token, { block = true } = {}) {
        if (this.paused) {
            if (block) {
                await this.paused;
            }
            else {
                return;
            }
        }
        if (this.closing) {
            return;
        }
        if (this.drained && block) {
            try {
                const jobId = await this.waitForJob();
                if (jobId) {
                    return this.moveToActive(token, jobId);
                }
            }
            catch (err) {
                // Swallow error if locally paused or closing since we did force a disconnection
                if (!((this.paused || this.closing) &&
                    err.message === 'Connection is closed.')) {
                    throw err;
                }
            }
        }
        else {
            return this.moveToActive(token);
        }
    }
    async moveToActive(token, jobId) {
        const [jobData, id] = await scripts_1.Scripts.moveToActive(this, token, jobId);
        return this.nextJobFromJobData(jobData, id);
    }
    async waitForJob() {
        const client = await this.blockingConnection.client;
        if (this.paused) {
            return;
        }
        let jobId;
        const opts = this.opts;
        try {
            this.waiting = true;
            jobId = await client.brpoplpush(this.keys.wait, this.keys.active, opts.drainDelay);
        }
        finally {
            this.waiting = false;
        }
        return jobId;
    }
    async nextJobFromJobData(jobData, jobId) {
        if (jobData) {
            this.drained = false;
            //
            // Check if the queue is rate limited. jobData will be the amount
            // of rate limited jobs.
            //
            if (typeof jobData === 'number') {
                if (this.opts.limiter.workerDelay) {
                    const rateKeyExpirationTime = jobData;
                    await utils_1.delay(rateKeyExpirationTime);
                }
            }
            else {
                const job = job_1.Job.fromJSON(this, jobData, jobId);
                if (job.opts.repeat) {
                    const repeat = await this.repeat;
                    await repeat.addNextRepeatableJob(job.name, job.data, job.opts);
                }
                return job;
            }
        }
        else if (!this.drained) {
            this.emit('drained');
            this.drained = true;
        }
    }
    async processJob(job, token) {
        if (!job || this.closing || this.paused) {
            return;
        }
        // code from Bull3..
        //
        // There are two cases to take into consideration regarding locks.
        // 1) The lock renewer fails to renew a lock, this should make this job
        // unable to complete, since some other worker is also working on it.
        // 2) The lock renewer is called more seldom than the check for stalled
        // jobs, so we can assume the job has been stalled and is already being processed
        // by another worker. See https://github.com/OptimalBits/bull/issues/308
        //
        // TODO: Have only 1 timer that extends all the locks instead of one timer
        // per concurrency setting.
        let lockRenewId;
        let timerStopped = false;
        const lockExtender = () => {
            lockRenewId = this.timerManager.setTimer('lockExtender', this.opts.lockRenewTime, async () => {
                try {
                    const result = await job.extendLock(token, this.opts.lockDuration);
                    if (result && !timerStopped) {
                        lockExtender();
                    }
                    // FIXME if result = 0 (missing lock), reject processFn promise to take next job?
                }
                catch (error) {
                    console.error('Error extending lock ', error);
                    // Somehow tell the worker this job should stop processing...
                }
            });
        };
        const stopTimer = () => {
            timerStopped = true;
            this.timerManager.clearTimer(lockRenewId);
        };
        // end copy-paste from Bull3
        const handleCompleted = async (result) => {
            const jobData = await job.moveToCompleted(result, token, !(this.closing || this.paused));
            this.emit('completed', job, result, 'active');
            return jobData ? this.nextJobFromJobData(jobData[0], jobData[1]) : null;
        };
        const handleFailed = async (err) => {
            try {
                await job.moveToFailed(err, token);
                this.emit('failed', job, err, 'active');
            }
            catch (err) {
                this.emit('error', err);
                // It probably means that the job has lost the lock before completion
                // The QueueScheduler will (or already has) moved the job back
                // to the waiting list (as stalled)
            }
        };
        // TODO: how to cancel the processing? (null -> job.cancel() => throw CancelError()void)
        this.emit('active', job, null, 'waiting');
        lockExtender();
        try {
            const result = await this.processFn(job, token);
            return await handleCompleted(result);
        }
        catch (err) {
            return handleFailed(err);
        }
        finally {
            stopTimer();
        }
        /*
          var timeoutMs = job.opts.timeout;
    
          if (timeoutMs) {
            jobPromise = jobPromise.timeout(timeoutMs);
          }
        */
        // Local event with jobPromise so that we can cancel job.
        // this.emit('active', job, jobPromise, 'waiting');
        // return jobPromise.then(handleCompleted).catch(handleFailed);
    }
    /**
     * Pauses the processing of this queue only for this worker.
     */
    async pause(doNotWaitActive) {
        if (!this.paused) {
            this.paused = new Promise(resolve => {
                this.resumeWorker = function () {
                    resolve();
                    this.paused = null; // Allow pause to be checked externally for paused state.
                    this.resumeWorker = null;
                };
            });
            await (!doNotWaitActive && this.whenCurrentJobsFinished());
            this.emit('paused');
        }
    }
    resume() {
        if (this.resumeWorker) {
            this.resumeWorker();
            this.emit('resumed');
        }
    }
    isPaused() {
        return !!this.paused;
    }
    /**
     * Returns a promise that resolves when active jobs are cleared
     *
     * @returns {Promise}
     */
    async whenCurrentJobsFinished(reconnect = true) {
        //
        // Force reconnection of blocking connection to abort blocking redis call immediately.
        //
        if (this.waiting) {
            await this.blockingConnection.disconnect();
        }
        else {
            reconnect = false;
        }
        if (this.processing) {
            await Promise.all(this.processing.keys());
        }
        reconnect && (await this.blockingConnection.reconnect());
    }
    close(force = false) {
        if (this.closing) {
            return this.closing;
        }
        this.closing = (async () => {
            this.emit('closing', 'closing queue');
            const client = await this.blockingConnection.client;
            this.resume();
            await Promise.resolve()
                .finally(() => {
                return force || this.whenCurrentJobsFinished(false);
            })
                .finally(() => {
                var _a;
                const closePoolPromise = (_a = this.childPool) === null || _a === void 0 ? void 0 : _a.clean();
                if (force) {
                    // since we're not waiting for the job to end attach
                    // an error handler to avoid crashing the whole process
                    closePoolPromise === null || closePoolPromise === void 0 ? void 0 : closePoolPromise.catch(err => {
                        console.error(err);
                    });
                    return;
                }
                return closePoolPromise;
            })
                .finally(() => client.disconnect())
                .finally(() => this.timerManager && this.timerManager.clearAllTimers())
                .finally(() => this.connection.close())
                .finally(() => this.emit('closed'));
        })();
        return this.closing;
    }
}
exports.Worker = Worker;
//# sourceMappingURL=worker.js.map