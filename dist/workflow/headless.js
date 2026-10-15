"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runHeadless = runHeadless;
const colors_1 = require("../utils/colors");
const git_1 = require("../utils/git");
const jira_1 = require("../services/jira");
const steps_1 = require("./steps");
const protected_1 = require("./protected");
const mergeRequest_1 = require("./mergeRequest");
const JIRA_KEY_PATTERN = /^[A-Za-z]+-[0-9]+$/;
function validateOptions(options) {
    // Valid issue inputs: --ticket alone (reuse issue), --message alone (create
    // issue), or both (reuse issue with a custom commit message). Neither is invalid.
    if (!options.message && !options.ticket) {
        (0, colors_1.printError)('Headless mode needs a Jira issue. Pass --ticket <KEY> to use an existing issue ' +
            'or --message <text> to create one.');
        process.exit(1);
    }
    if (options.ticket && !JIRA_KEY_PATTERN.test(options.ticket)) {
        (0, colors_1.printError)(`Invalid Jira ticket key: '${options.ticket}'. Expected a key like PROJ-123.`);
        process.exit(1);
    }
    if (options.message && /[\r\n]/.test(options.message)) {
        (0, colors_1.printError)('--message must be a single line (the title). Put details in --description / --description-file.');
        process.exit(1);
    }
    if (options.createBranch && options.switchBranch) {
        (0, colors_1.printError)('Cannot use --create-branch and --branch together. Choose one branch action.');
        process.exit(1);
    }
    if (options.createBranch && !options.baseBranch) {
        (0, colors_1.printError)('--create-branch requires --base <branch> to create the new branch from.');
        process.exit(1);
    }
    if (options.baseBranch && !options.createBranch) {
        (0, colors_1.printError)('--base only applies to --create-branch. Add --create-branch <name>.');
        process.exit(1);
    }
    if (options.mr === true && options.push === false) {
        (0, colors_1.printError)('--mr needs the branch on the remote. Drop --no-push.');
        process.exit(1);
    }
    if (options.targetBranch && options.mr === false) {
        (0, colors_1.printError)('--target only applies when a merge request is created. Drop --no-mr.');
        process.exit(1);
    }
}
function resolveBranch(options, currentBranch) {
    if (options.createBranch) {
        const base = options.baseBranch;
        if (!(0, git_1.createBranchFromBase)(base, options.createBranch)) {
            (0, colors_1.printError)(`Failed to create branch '${options.createBranch}' from '${base}'`);
            process.exit(1);
        }
        if (!(0, git_1.switchBranch)(options.createBranch)) {
            (0, colors_1.printError)(`Failed to switch to newly created branch '${options.createBranch}'`);
            process.exit(1);
        }
        (0, colors_1.printSuccess)(`Created and switched to branch '${options.createBranch}' from '${base}'`);
        return options.createBranch;
    }
    if (options.switchBranch) {
        if (!(0, git_1.switchBranch)(options.switchBranch)) {
            (0, colors_1.printError)(`Failed to switch to branch '${options.switchBranch}'`);
            process.exit(1);
        }
        (0, colors_1.printSuccess)(`Switched to branch '${options.switchBranch}'`);
        return (0, git_1.getCurrentBranch)() || options.switchBranch;
    }
    return currentBranch;
}
async function resolveIssue(jiraService, options) {
    if (options.ticket) {
        if (options.message) {
            return { key: options.ticket, subject: `${options.ticket} | ${options.message}` };
        }
        (0, colors_1.printInfo)('Fetching Jira work item details...');
        const { summary, status } = await jiraService.getIssue(options.ticket);
        if (!summary) {
            (0, colors_1.printError)(`Could not read a summary for ${options.ticket}.`);
            process.exit(1);
        }
        (0, colors_1.printInfo)(`Using ${options.ticket} (${status || 'unknown status'}): ${summary}`);
        return { key: options.ticket, subject: `${options.ticket} | Fix: ${summary}` };
    }
    const summary = options.message;
    const description = options.description || summary;
    (0, colors_1.printInfo)('Creating Jira work item...');
    const issueKey = await jiraService.createIssue(summary, description);
    (0, colors_1.printSuccess)(`Created Jira work item: ${issueKey}`);
    return { key: issueKey, subject: `${issueKey} | ${summary}` };
}
async function runHeadless(config, configPath, options) {
    validateOptions(options);
    (0, steps_1.assertGitRepo)();
    let currentBranch = (0, steps_1.requireCurrentBranch)();
    (0, colors_1.printInfo)(`Branch: ${currentBranch}`);
    currentBranch = resolveBranch(options, currentBranch);
    (0, steps_1.assertStagedChanges)();
    const protectedBranches = await (0, protected_1.loadProtectedBranches)(config, configPath, {
        refresh: options.refreshProtected,
    });
    const workBranch = (0, protected_1.ensureWorkBranch)(currentBranch, config, protectedBranches.all);
    currentBranch = workBranch.branch;
    const jiraService = new jira_1.JiraService(config);
    const issue = await resolveIssue(jiraService, options);
    (0, steps_1.commitChanges)((0, steps_1.buildCommitMessage)(issue.subject, options.description));
    const createMr = options.mr ?? (0, mergeRequest_1.isAutoMrEnabled)(config);
    const push = options.push === true || options.mr === true;
    if (push) {
        await (0, mergeRequest_1.pushAndCreateMergeRequest)(config, {
            sourceBranch: currentBranch,
            targetBranch: options.targetBranch,
            baseBranch: workBranch.protectedBase || options.baseBranch,
            title: issue.subject,
            description: options.description || issue.subject,
            jiraKey: issue.key,
            jiraUrl: jiraService.browseUrl(issue.key),
        }, { createMr, push });
    }
    else {
        (0, colors_1.printInfo)('Commit was not pushed to remote. Pass --push to push.');
        if (createMr) {
            (0, colors_1.printInfo)('Merge request not created because the branch was not pushed. Pass --push or --mr.');
        }
    }
    (0, colors_1.printSuccess)('Committed successfully!');
}
//# sourceMappingURL=headless.js.map