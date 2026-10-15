"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runGit = runGit;
exports.listLocalBranches = listLocalBranches;
exports.listRemoteBranches = listRemoteBranches;
exports.getCurrentBranch = getCurrentBranch;
exports.switchBranch = switchBranch;
exports.createBranchFromBase = createBranchFromBase;
exports.getRemoteUrl = getRemoteUrl;
exports.getRepoRoot = getRepoRoot;
exports.localBranchExists = localBranchExists;
exports.remoteBranchExists = remoteBranchExists;
exports.createAndSwitchBranch = createAndSwitchBranch;
exports.getRemoteDefaultBranch = getRemoteDefaultBranch;
exports.getLastCommitMessage = getLastCommitMessage;
const child_process_1 = require("child_process");
function runCommand(command, args, options = {}) {
    const result = (0, child_process_1.spawnSync)(command, args, { encoding: 'utf8', ...options });
    if (result.error) {
        throw result.error;
    }
    return {
        status: result.status || 0,
        stdout: result.stdout || '',
        stderr: result.stderr || '',
    };
}
function runGit(args, options = {}) {
    return runCommand('git', args, options);
}
function listLocalBranches() {
    const result = runGit(['branch']);
    if (result.status !== 0) {
        throw new Error(result.stderr || 'Failed to list branches.');
    }
    return result.stdout
        .split('\n')
        .map((line) => line.replace(/^[* ]\s?/, '').trim())
        .filter(Boolean);
}
function listRemoteBranches() {
    const result = runGit(['branch', '-r']);
    if (result.status !== 0) {
        throw new Error(result.stderr || 'Failed to list remote branches.');
    }
    const branches = result.stdout
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.startsWith('origin/') && !line.includes('HEAD'))
        .map((line) => line.replace(/^origin\//, ''));
    return [...new Set(branches)].sort();
}
function getCurrentBranch() {
    const result = runGit(['rev-parse', '--abbrev-ref', 'HEAD']);
    if (result.status !== 0) {
        return '';
    }
    return result.stdout.trim();
}
function switchBranch(branchName) {
    const result = runGit(['checkout', branchName], { stdio: 'inherit' });
    return result.status === 0;
}
function createBranchFromBase(baseBranch, newBranch) {
    // Fetch the latest from remote base branch
    const fetchResult = runGit(['fetch', 'origin', baseBranch], { stdio: 'inherit' });
    if (fetchResult.status !== 0) {
        return false;
    }
    // Try to create branch from remote base branch first
    let result = runGit(['branch', newBranch, `origin/${baseBranch}`], { stdio: 'inherit' });
    if (result.status === 0) {
        return true;
    }
    // Fallback to local base branch if remote doesn't exist
    result = runGit(['branch', newBranch, baseBranch], { stdio: 'inherit' });
    return result.status === 0;
}
function getRemoteUrl(remote = 'origin') {
    const result = runGit(['remote', 'get-url', remote]);
    return result.status === 0 ? result.stdout.trim() : '';
}
function getRepoRoot() {
    const result = runGit(['rev-parse', '--show-toplevel']);
    return result.status === 0 ? result.stdout.trim() : '';
}
function localBranchExists(branchName) {
    return runGit(['show-ref', '--verify', '--quiet', `refs/heads/${branchName}`]).status === 0;
}
function remoteBranchExists(branchName, remote = 'origin') {
    return runGit(['show-ref', '--verify', '--quiet', `refs/remotes/${remote}/${branchName}`]).status === 0;
}
/** Creates `branchName` at the current HEAD and switches to it; staged changes carry over. */
function createAndSwitchBranch(branchName) {
    const result = runGit(['checkout', '-b', branchName], { stdio: 'inherit' });
    return result.status === 0;
}
/** The remote's default branch (e.g. `master`), from the local ref or by asking the remote. */
function getRemoteDefaultBranch(remote = 'origin') {
    const local = runGit(['symbolic-ref', '--short', `refs/remotes/${remote}/HEAD`]);
    if (local.status === 0 && local.stdout.trim()) {
        return local.stdout.trim().replace(new RegExp(`^${remote}/`), '');
    }
    const remoteHead = runGit(['ls-remote', '--symref', remote, 'HEAD'], { timeout: 10000 });
    const match = remoteHead.stdout.match(/^ref:\s+refs\/heads\/(\S+)\s+HEAD/m);
    return match ? match[1] : '';
}
function getLastCommitMessage() {
    const subject = runGit(['log', '-1', '--format=%s']).stdout.trim();
    const body = runGit(['log', '-1', '--format=%b']).stdout.trim();
    return { subject, body };
}
//# sourceMappingURL=git.js.map