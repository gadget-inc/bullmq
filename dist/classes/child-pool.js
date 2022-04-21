"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChildPool = void 0;
const child_process_1 = require("child_process");
const path = require("path");
const lodash_1 = require("lodash");
const getPort = require("get-port");
const fs = require("fs");
const util_1 = require("util");
const process_utils_1 = require("./process-utils");
const stat = util_1.promisify(fs.stat);
const CHILD_KILL_TIMEOUT = 30000;
const convertExecArgv = async (execArgv) => {
    const standard = [];
    const convertedArgs = [];
    for (let i = 0; i < execArgv.length; i++) {
        const arg = execArgv[i];
        if (arg.indexOf('--inspect') === -1) {
            standard.push(arg);
        }
        else {
            const argName = arg.split('=')[0];
            const port = await getPort();
            convertedArgs.push(`${argName}=${port}`);
        }
    }
    return standard.concat(convertedArgs);
};
const exitCodesErrors = {
    1: 'Uncaught Fatal Exception',
    2: 'Unused',
    3: 'Internal JavaScript Parse Error',
    4: 'Internal JavaScript Evaluation Failure',
    5: 'Fatal Error',
    6: 'Non-function Internal Exception Handler',
    7: 'Internal Exception Handler Run-Time Failure',
    8: 'Unused',
    9: 'Invalid Argument',
    10: 'Internal JavaScript Run-Time Failure',
    12: 'Invalid Debug Argument',
    13: 'Unfinished Top-Level Await',
};
async function initChild(child, processFile) {
    const onComplete = new Promise((resolve, reject) => {
        const onMessageHandler = (msg) => {
            if (msg.cmd === 'init-complete') {
                resolve();
                child.off('message', onMessageHandler);
            }
        };
        child.on('message', onMessageHandler);
        child.on('close', (code, signal) => {
            if (code > 128) {
                code -= 128;
            }
            const msg = exitCodesErrors[code] || `Unknown exit code ${code}`;
            reject(new Error(`Error initializing child: ${msg} and signal ${signal}`));
        });
    });
    await new Promise(resolve => child.send({ cmd: 'init', value: processFile }, resolve));
    await onComplete;
}
class ChildPool {
    constructor() {
        this.retained = {};
        this.free = {};
    }
    async retain(processFile) {
        const _this = this;
        let child = _this.getFree(processFile).pop();
        if (child) {
            _this.retained[child.pid] = child;
            return child;
        }
        const execArgv = await convertExecArgv(process.execArgv);
        let masterFile = path.join(__dirname, './master.js');
        try {
            await stat(masterFile); // would throw if file not exists
        }
        catch (_) {
            masterFile = path.join(process.cwd(), 'dist/classes/master.js');
            await stat(masterFile);
        }
        child = child_process_1.fork(masterFile, [], { execArgv, stdio: 'pipe' });
        child.processFile = processFile;
        _this.retained[child.pid] = child;
        child.on('exit', _this.remove.bind(_this, child));
        child.stdout.on('data', function (data) {
            console.log(data.toString());
        });
        await initChild(child, child.processFile);
        return child;
    }
    release(child) {
        delete this.retained[child.pid];
        this.getFree(child.processFile).push(child);
    }
    remove(child) {
        delete this.retained[child.pid];
        const free = this.getFree(child.processFile);
        const childIndex = free.indexOf(child);
        if (childIndex > -1) {
            free.splice(childIndex, 1);
        }
    }
    async kill(child, signal = 'SIGKILL') {
        this.remove(child);
        await process_utils_1.killAsync(child, signal, CHILD_KILL_TIMEOUT);
    }
    async clean() {
        const children = lodash_1.values(this.retained).concat(this.getAllFree());
        this.retained = {};
        this.free = {};
        await Promise.all(children.map(c => this.kill(c, 'SIGTERM')));
    }
    getFree(id) {
        return (this.free[id] = this.free[id] || []);
    }
    getAllFree() {
        return lodash_1.flatten(lodash_1.values(this.free));
    }
}
exports.ChildPool = ChildPool;
//# sourceMappingURL=child-pool.js.map