import * as fs from 'fs';
import * as path from 'path';
import { v4 } from 'uuid';
import { clientCommandMessageReg, delay, DELAY_TIME_1, isNotConnectionError, isRedisInstance, WORKER_SUFFIX, } from '../utils';
import { QueueBase } from './queue-base';
import { Repeat } from './repeat';
import { ChildPool } from './child-pool';
import { Job } from './job';
import { RedisConnection } from './redis-connection';
import sandbox from './sandbox';
import { Scripts } from './scripts';
import { TimerManager } from './timer-manager';
/**
 *
 * This class represents a worker that is able to process jobs from the queue.
 * As soon as the class is instantiated it will start processing jobs.
 *
 */
export class Worker extends QueueBase {
    constructor(name, processor, opts = {}, Connection) {
        super(name, Object.assign(Object.assign({}, opts), { sharedConnection: isRedisInstance(opts.connection), blockingConnection: true }), Connection);
        this.waiting = false;
        this.running = false;
        this.blockTimeout = 0;
        this.opts = Object.assign({ drainDelay: 5, concurrency: 1, lockDuration: 30000, runRetryDelay: 15000, autorun: true }, this.opts);
        this.opts.lockRenewTime =
            this.opts.lockRenewTime || this.opts.lockDuration / 2;
        this.blockingConnection = new RedisConnection(isRedisInstance(opts.connection)
            ? opts.connection.duplicate()
            : opts.connection);
        this.blockingConnection.on('error', error => this.emit('error', error));
        if (processor) {
            if (typeof processor === 'function') {
                this.processFn = processor;
            }
            else {
                // SANDBOXED
                const supportedFileTypes = ['.js', '.ts', '.flow', '.cjs'];
                const processorFile = processor +
                    (supportedFileTypes.includes(path.extname(processor)) ? '' : '.js');
                if (!fs.existsSync(processorFile)) {
                    throw new Error(`File ${processorFile} does not exist`);
                }
                let masterFile = path.join(__dirname, './master.js');
                try {
                    fs.statSync(masterFile); // would throw if file not exists
                }
                catch (_) {
                    masterFile = path.join(process.cwd(), 'dist/cjs/classes/master.js');
                    fs.statSync(masterFile);
                }
                this.childPool = new ChildPool(masterFile);
                this.processFn = sandbox(processor, this.childPool).bind(this);
            }
            this.timerManager = new TimerManager();
            if (this.opts.autorun) {
                this.run().catch(error => this.emit('error', error));
            }
        }
        this.on('error', err => console.error(err));
    }
    emit(event, ...args) {
        return super.emit(event, ...args);
    }
    off(eventName, listener) {
        super.off(eventName, listener);
        return this;
    }
    on(event, listener) {
        super.on(event, listener);
        return this;
    }
    once(event, listener) {
        super.once(event, listener);
        return this;
    }
    callProcessJob(job, token) {
        return this.processFn(job, token);
    }
    createJob(data, jobId) {
        return Job.fromJSON(this, data, jobId);
    }
    /**
     *
     * Waits until the worker is ready to start processing jobs.
     * In general only useful when writing tests.
     *
     */
    async waitUntilReady() {
        await super.waitUntilReady();
        return this.blockingConnection.client;
    }
    get repeat() {
        return new Promise(async (resolve) => {
            if (!this._repeat) {
                const connection = await this.client;
                this._repeat = new Repeat(this.name, Object.assign(Object.assign({}, this.opts), { connection }));
                this._repeat.on('error', e => this.emit.bind(this, e));
            }
            resolve(this._repeat);
        });
    }
    async run() {
        if (this.processFn) {
            if (!this.running) {
                try {
                    this.running = true;
                    const client = await this.client;
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
                        await client.client('setname', this.clientName(WORKER_SUFFIX));
                    }
                    catch (err) {
                        if (!clientCommandMessageReg.test(err.message)) {
                            throw err;
                        }
                    }
                    const opts = this.opts;
                    const processing = (this.processing = new Map());
                    const tokens = Array.from({ length: opts.concurrency }, () => v4());
                    while (!this.closing) {
                        if (processing.size < opts.concurrency) {
                            const token = tokens.pop();
                            processing.set(this.retryIfFailed(() => this.getNextJob(token), this.opts.runRetryDelay), token);
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
                            processing.set(this.retryIfFailed(() => this.processJob(job, token), this.opts.runRetryDelay), token);
                        }
                        else {
                            tokens.push(token);
                        }
                    }
                    this.running = false;
                    return Promise.all([...processing.keys()]);
                }
                catch (error) {
                    this.running = false;
                    throw error;
                }
            }
            else {
                throw new Error('Worker is already running.');
            }
        }
        else {
            throw new Error('No process function is defined.');
        }
    }
    /**
     * Returns a promise that resolves to the next job in queue.
     * @param token - worker token to be assigned to retrieved job
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
                return this.moveToActive(token, jobId);
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
        const [jobData, id] = await Scripts.moveToActive(this, token, jobId);
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
            let blockTimeout = Math.max(this.blockTimeout ? this.blockTimeout / 1000 : opts.drainDelay, 0.01);
            // Only Redis v6.0.0 and above supports doubles as block time
            blockTimeout =
                this.blockingConnection.redisVersion < '6.0.0'
                    ? Math.ceil(blockTimeout)
                    : blockTimeout;
            jobId = await client.brpoplpush(this.keys.wait, this.keys.active, blockTimeout);
        }
        catch (error) {
            if (isNotConnectionError(error)) {
                this.emit('error', error);
            }
            await this.delay();
        }
        finally {
            this.waiting = false;
        }
        return jobId;
    }
    /**
     *
     * This function is exposed only for testing purposes.
     */
    async delay() {
        await delay(DELAY_TIME_1);
    }
    async nextJobFromJobData(jobData, jobId) {
        var _a, _b;
        // NOTE: This is not really optimal in all cases since a new job would could arrive at the wait
        // list and this worker will not start processing it directly.
        // Best would be to emit drain and block for rateKeyExpirationTime
        if (typeof jobData === 'number') {
            if (!this.drained) {
                this.emit('drained');
                this.drained = true;
            }
            // workerDelay left for backwards compatibility although not recommended to use.
            if ((_b = (_a = this.opts) === null || _a === void 0 ? void 0 : _a.limiter) === null || _b === void 0 ? void 0 : _b.workerDelay) {
                const rateKeyExpirationTime = jobData;
                await delay(rateKeyExpirationTime);
            }
            else {
                this.blockTimeout = jobData;
            }
        }
        else if (jobData) {
            this.drained = false;
            const job = this.createJob(jobData, jobId);
            if (job.opts.repeat) {
                const repeat = await this.repeat;
                await repeat.addNextRepeatableJob(job.name, job.data, job.opts);
            }
            return job;
        }
        else if (!this.drained) {
            this.blockTimeout = 0;
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
            const completed = await job.moveToCompleted(result, token, !(this.closing || this.paused));
            this.emit('completed', job, result, 'active');
            const [jobData, jobId] = completed || [];
            return this.nextJobFromJobData(jobData, jobId);
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
        this.emit('active', job, 'waiting');
        lockExtender();
        try {
            const result = await this.callProcessJob(job, token);
            return await handleCompleted(result);
        }
        catch (err) {
            return handleFailed(err);
        }
        finally {
            stopTimer();
        }
    }
    /**
     *
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
    /**
     *
     * Resumes processing of this worker (if paused).
     */
    resume() {
        if (this.resumeWorker) {
            this.resumeWorker();
            this.emit('resumed');
        }
    }
    /**
     *
     * Checks if worker is paused.
     *
     * @returns true if worker is paused, false otherwise.
     */
    isPaused() {
        return !!this.paused;
    }
    /**
     *
     * Checks if worker is currently running.
     *
     * @returns true if worker is running, false otherwise.
     */
    isRunning() {
        return this.running;
    }
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
    /**
     * Returns a promise that resolves when active jobs are cleared
     *
     * @returns
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
    async retryIfFailed(fn, delayInMs) {
        const retry = 1;
        do {
            try {
                return await fn();
            }
            catch (err) {
                this.emit('error', err);
                if (delayInMs) {
                    await delay(delayInMs);
                }
                else {
                    return;
                }
            }
        } while (retry);
    }
}
//# sourceMappingURL=worker.js.map