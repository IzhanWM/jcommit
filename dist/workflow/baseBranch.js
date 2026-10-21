"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.describeLocalOnlyBase = describeLocalOnlyBase;
exports.createBranchFromBaseInteractive = createBranchFromBaseInteractive;
const colors_1 = require("../utils/colors");
const git_1 = require("../utils/git");
function describeLocalOnlyBase(baseBranch, status) {
    return status.reason === 'not-on-remote'
        ? `Base branch '${baseBranch}' exists only locally; it is not on origin.`
        : `Could not fetch '${baseBranch}' from origin (${status.detail.split('\n')[0] || 'fetch failed'}); a local '${baseBranch}' exists.`;
}
/**
 * Creates `newBranch` from `baseBranch` and switches to it. Uses `origin/<base>`
 * when the remote has it. When only a local base exists, `chooseLocalBase`
 * decides: branch from the local copy, push it to origin first, or cancel.
 * Exits the process on failure or cancel.
 */
async function createBranchFromBaseInteractive(baseBranch, newBranch, chooseLocalBase) {
    const status = (0, git_1.locateBaseBranch)(baseBranch);
    let source = 'remote';
    if (status.location === 'missing') {
        (0, colors_1.printError)(`Base branch '${baseBranch}' was not found locally or on origin.`);
        if (status.detail) {
            (0, colors_1.printError)(status.detail);
        }
        process.exit(1);
    }
    if (status.location === 'local-only') {
        const choice = await chooseLocalBase(describeLocalOnlyBase(baseBranch, status));
        if (choice === 'cancel') {
            (0, colors_1.printInfo)('Cancelled. No branch was created.');
            process.exit(1);
        }
        if (choice === 'push') {
            (0, colors_1.printInfo)(`Pushing '${baseBranch}' to origin...`);
            if (!(0, git_1.pushBranch)(baseBranch)) {
                (0, colors_1.printError)(`Failed to push '${baseBranch}' to origin.`);
                process.exit(1);
            }
        }
        else {
            source = 'local';
        }
    }
    if (!(0, git_1.createBranchFromBase)(baseBranch, newBranch, source)) {
        (0, colors_1.printError)(`Failed to create branch '${newBranch}' from '${baseBranch}'`);
        process.exit(1);
    }
    if (!(0, git_1.switchBranch)(newBranch)) {
        (0, colors_1.printError)(`Failed to switch to newly created branch '${newBranch}'`);
        process.exit(1);
    }
    const from = source === 'local' ? `local '${baseBranch}'` : `origin/${baseBranch}`;
    (0, colors_1.printSuccess)(`Created and switched to branch '${newBranch}' from ${from}`);
}
//# sourceMappingURL=baseBranch.js.map