"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.assertGitRepo = assertGitRepo;
exports.requireCurrentBranch = requireCurrentBranch;
exports.assertStagedChanges = assertStagedChanges;
exports.buildCommitMessage = buildCommitMessage;
exports.commitChanges = commitChanges;
exports.pushCurrentBranch = pushCurrentBranch;
const colors_1 = require("../utils/colors");
const git_1 = require("../utils/git");
/**
 * Shared, non-interactive workflow steps used by both the interactive and the
 * headless flows. Each step prints its own feedback and exits the process on a
 * fatal error, so callers can compose them top-to-bottom without re-checking.
 */
function assertGitRepo() {
    const gitCheck = (0, git_1.runGit)(['rev-parse', '--git-dir']);
    if (gitCheck.status !== 0) {
        (0, colors_1.printError)('Not in a git repository!');
        process.exit(1);
    }
}
function requireCurrentBranch() {
    const currentBranch = (0, git_1.getCurrentBranch)();
    if (!currentBranch) {
        (0, colors_1.printError)('Failed to get current branch');
        process.exit(1);
    }
    return currentBranch;
}
function assertStagedChanges() {
    const diffResult = (0, git_1.runGit)(['diff', '--cached', '--quiet']);
    if (diffResult.status === 0) {
        (0, colors_1.printError)('No staged changes found. Please stage your changes before committing.');
        process.exit(1);
    }
}
/**
 * Builds the full commit message: the `KEY | title` subject line, then the
 * structured description as the body (skipped when it only repeats the title).
 */
function buildCommitMessage(subject, body) {
    const trimmedBody = (body || '').trim();
    const title = subject.replace(/^[A-Za-z]+-[0-9]+ \| /, '').trim();
    if (!trimmedBody || trimmedBody === title) {
        return subject;
    }
    return `${subject}\n\n${trimmedBody}`;
}
function commitChanges(commitMessage) {
    (0, colors_1.printInfo)('Committing...');
    // Pass the message on stdin so multi-line markdown bodies survive intact;
    // `whitespace` cleanup keeps `## Heading` lines that `strip` would drop.
    const commitResult = (0, git_1.runGit)(['commit', '--cleanup=whitespace', '-F', '-'], {
        input: commitMessage,
        stdio: ['pipe', 'inherit', 'inherit'],
    });
    if (commitResult.status !== 0) {
        (0, colors_1.printError)('Git commit failed');
        process.exit(1);
    }
    (0, colors_1.printSuccess)(`Git commit successful with message: ${commitMessage.split('\n')[0]}`);
}
function pushCurrentBranch() {
    const currentBranch = (0, git_1.getCurrentBranch)();
    (0, colors_1.printInfo)('Pushing to remote...');
    const pushResult = (0, git_1.runGit)(['push', '--set-upstream', 'origin', currentBranch], {
        stdio: 'inherit',
    });
    if (pushResult.status !== 0) {
        (0, colors_1.printError)('Git push failed');
        process.exit(1);
    }
    (0, colors_1.printSuccess)('Git push successful');
}
//# sourceMappingURL=steps.js.map