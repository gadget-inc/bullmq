import { promisify } from 'util';
import { ParentCommand } from '../interfaces';
import { childSend } from '../utils';
var ChildStatus;
(function (ChildStatus) {
    ChildStatus[ChildStatus["Idle"] = 0] = "Idle";
    ChildStatus[ChildStatus["Started"] = 1] = "Started";
    ChildStatus[ChildStatus["Terminating"] = 2] = "Terminating";
    ChildStatus[ChildStatus["Errored"] = 3] = "Errored";
})(ChildStatus || (ChildStatus = {}));
/**
 * ChildProcessor
 *
 * This class acts as the interface between a child process and it parent process
 * so that jobs can be processed in different processes than the parent.
 *
 */
export class ChildProcessor {
    async init(processorFile) {
        let processor;
        try {
            processor = require(processorFile);
        }
        catch (err) {
            this.status = ChildStatus.Errored;
            return childSend(process, {
                cmd: ParentCommand.InitFailed,
                err: err,
            });
        }
        if (processor.default) {
            // support es2015 module.
            processor = processor.default;
        }
        if (processor.length > 1) {
            processor = promisify(processor);
        }
        else {
            const origProcessor = processor;
            processor = function (...args) {
                try {
                    return Promise.resolve(origProcessor(...args));
                }
                catch (err) {
                    return Promise.reject(err);
                }
            };
        }
        this.processor = processor;
        this.status = ChildStatus.Idle;
        await childSend(process, {
            cmd: ParentCommand.InitCompleted,
        });
    }
    async start(jobJson) {
        if (this.status !== ChildStatus.Idle) {
            return childSend(process, {
                cmd: ParentCommand.Error,
                err: new Error('cannot start a not idling child process'),
            });
        }
        this.status = ChildStatus.Started;
        this.currentJobPromise = (async () => {
            try {
                const job = wrapJob(jobJson);
                const result = (await this.processor(job)) || {};
                await childSend(process, {
                    cmd: ParentCommand.Completed,
                    value: result,
                });
            }
            catch (err) {
                await childSend(process, {
                    cmd: ParentCommand.Failed,
                    value: !err.message ? new Error(err) : err,
                });
            }
            finally {
                this.status = ChildStatus.Idle;
                this.currentJobPromise = undefined;
            }
        })();
    }
    async stop() { }
    async waitForCurrentJobAndExit() {
        this.status = ChildStatus.Terminating;
        try {
            await this.currentJobPromise;
        }
        finally {
            process.exit(process.exitCode || 0);
        }
    }
}
// https://stackoverflow.com/questions/18391212/is-it-not-possible-to-stringify-an-error-using-json-stringify
if (!('toJSON' in Error.prototype)) {
    Object.defineProperty(Error.prototype, 'toJSON', {
        value: function () {
            const alt = {};
            const _this = this;
            Object.getOwnPropertyNames(_this).forEach(function (key) {
                alt[key] = _this[key];
            }, this);
            return alt;
        },
        configurable: true,
        writable: true,
    });
}
/**
 * Enhance the given job argument with some functions
 * that can be called from the sandboxed job processor.
 *
 * Note, the `job` argument is a JSON deserialized message
 * from the main node process to this forked child process,
 * the functions on the original job object are not in tact.
 * The wrapped job adds back some of those original functions.
 */
function wrapJob(job) {
    let progressValue = job.progress;
    const updateProgress = async (progress) => {
        // Locally store reference to new progress value
        // so that we can return it from this process synchronously.
        progressValue = progress;
        // Send message to update job progress.
        await childSend(process, {
            cmd: ParentCommand.Progress,
            value: progress,
        });
    };
    const progress = (progress) => {
        console.warn([
            'BullMQ: DEPRECATION WARNING! progress function in sandboxed processor is deprecated. This will',
            'be removed in the next major release, you should use updateProgress method instead.',
        ].join(' '));
        if (progress) {
            return updateProgress(progress);
        }
        else {
            // Return the last known progress value.
            return progressValue;
        }
    };
    return Object.assign(Object.assign({}, job), { data: JSON.parse(job.data || '{}'), opts: job.opts, returnValue: JSON.parse(job.returnvalue || '{}'), 
        /**
         * @deprecated Use updateProgress instead.
         * Emulate the real job `progress` function.
         * If no argument is given, it behaves as a sync getter.
         * If an argument is given, it behaves as an async setter.
         */
        progress,
        /*
         * Emulate the real job `updateProgress` function, should works as `progress` function.
         */
        updateProgress, 
        /*
         * Emulate the real job `log` function.
         */
        log: async (row) => {
            childSend(process, {
                cmd: ParentCommand.Log,
                value: row,
            });
        } });
}
//# sourceMappingURL=child-processor.js.map