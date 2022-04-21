/**
 * Load redis lua scripts.
 * The name of the script must have the following format:
 *
 * cmdName-numKeys.lua
 *
 * cmdName must be in camel case format.
 *
 * For example:
 * moveToFinish-3.lua
 *
 */
'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
exports.load = void 0;
const path = require('path');
const util = require('util');
const fs = require('fs');
const readdir = util.promisify(fs.readdir);
const readFile = util.promisify(fs.readFile);
exports.load = async function (client) {
    const scripts = await loadScripts(__dirname);
    scripts.forEach((command) => {
        // Only define the command if not already defined
        if (!client[command.name]) {
            client.defineCommand(command.name, command.options);
        }
    });
};
async function loadScripts(dir) {
    const files = await readdir(dir);
    const commands = [];
    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (path.extname(file) === '.lua') {
            const longName = path.basename(file, '.lua');
            const name = longName.split('-')[0];
            const numberOfKeys = parseInt(longName.split('-')[1]);
            const lua = await readFile(path.join(dir, file));
            commands.push({
                name,
                options: { numberOfKeys, lua: lua.toString() },
            });
        }
    }
    return commands;
}
//# sourceMappingURL=index.js.map