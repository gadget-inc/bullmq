"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const sandbox = (processFile, childPool) => {
    return async function process(job) {
        const child = await childPool.retain(processFile);
        let msgHandler;
        let exitHandler;
        child.send({
            cmd: 'start',
            job: job.asJSON(),
        });
        const done = new Promise((resolve, reject) => {
            msgHandler = async (msg) => {
                switch (msg.cmd) {
                    case 'completed':
                        resolve(msg.value);
                        break;
                    case 'failed':
                    case 'error': {
                        const err = new Error();
                        Object.assign(err, msg.value);
                        reject(err);
                        break;
                    }
                    case 'progress':
                        await job.updateProgress(msg.value);
                        break;
                    case 'log':
                        await job.log(msg.value);
                        break;
                }
            };
            exitHandler = (exitCode, signal) => {
                reject(new Error('Unexpected exit code: ' + exitCode + ' signal: ' + signal));
            };
            child.on('message', msgHandler);
            child.on('exit', exitHandler);
        });
        try {
            await done;
            return done;
        }
        finally {
            child.removeListener('message', msgHandler);
            child.removeListener('exit', exitHandler);
            if (child.exitCode !== null || /SIG.*/.test(child.signalCode)) {
                childPool.remove(child);
            }
            else {
                childPool.release(child);
            }
        }
    };
};
exports.default = sandbox;
//# sourceMappingURL=sandbox.js.map