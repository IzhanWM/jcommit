"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runSetup = runSetup;
exports.mainWorkflow = mainWorkflow;
const promises_1 = __importDefault(require("readline/promises"));
const colors_1 = require("../utils/colors");
const git_1 = require("../utils/git");
const prompts_1 = require("../utils/prompts");
const jira_1 = require("../services/jira");
const config_1 = require("../config/config");
const steps_1 = require("./steps");
const protected_1 = require("./protected");
const mergeRequest_1 = require("./mergeRequest");
async function runSetup(configPath) {
    const existingConfig = (0, config_1.readConfig)(configPath) || {};
    const rl = promises_1.default.createInterface({
        input: process.stdin,
        output: process.stdout,
    });
    (0, colors_1.printInfo)(`
┌─────────────────────────────────────────────────────────────────┐
│                 jcommit configuration setup                     │
└─────────────────────────────────────────────────────────────────┘

This interactive setup will create or update your jcommit configuration for Jira-Git integration.
• Leave fields blank to keep existing values
• Manual edit path: ${configPath}
`);
    const jiraDomain = await (0, prompts_1.promptInput)(rl, 'Jira URL (e.g., company.atlassian.net)', {
        required: true,
        defaultValue: existingConfig.jiraDomain,
    });
    const jiraEmail = await (0, prompts_1.promptInput)(rl, 'Email (e.g., user@company.com)', {
        required: true,
        defaultValue: existingConfig.jiraEmail,
    });
    const jiraApiToken = await (0, prompts_1.promptSecret)(rl, 'Jira API token (create at https://id.atlassian.com/manage-profile/security/api-tokens; copy token, not label)', {
        allowEmpty: true,
        hasExisting: Boolean(existingConfig.jiraApiToken),
    });
    const jiraAssigneeId = await (0, prompts_1.promptInput)(rl, 'Default Jira assignee account ID (press enter to leave unassigned)', {
        required: false,
        defaultValue: existingConfig.jiraAssigneeId,
    });
    const jiraProjectId = await (0, prompts_1.promptInput)(rl, 'Jira project ID (e.g., 11203)', {
        required: true,
        defaultValue: existingConfig.jiraProjectId,
    });
    const jiraIssueTypeId = await (0, prompts_1.promptInput)(rl, 'Jira issue type ID (e.g., 3)', {
        required: true,
        defaultValue: existingConfig.jiraIssueTypeId,
    });
    const protectedBranchesRaw = await (0, prompts_1.promptInput)(rl, 'Enter protected branches (separated by commas)', {
        defaultValue: (existingConfig.protectedBranches || (0, config_1.getDefaultProtectedBranches)()).join(','),
    });
    const branchPrefix = await (0, prompts_1.promptInput)(rl, 'Prefix for auto-created branches when committing on a protected branch (<prefix>/<branch>)', { defaultValue: existingConfig.branchPrefix || jiraEmail.split('@')[0] });
    const existingGitlab = existingConfig.gitlab || {};
    let gitlab = existingConfig.gitlab;
    if (await (0, prompts_1.promptYesNo)(rl, 'Configure GitLab (protected-branch detection & merge requests)?')) {
        const gitlabUrl = await (0, prompts_1.promptInput)(rl, 'GitLab URL (blank = use the host of the origin remote)', {
            defaultValue: existingGitlab.url,
        });
        const gitlabToken = await (0, prompts_1.promptSecret)(rl, 'GitLab personal access token with `api` scope (blank = use $GITLAB_TOKEN)', { allowEmpty: true, hasExisting: Boolean(existingGitlab.token) });
        const autoCreateMr = await (0, prompts_1.promptYesNo)(rl, 'Automatically create a merge request after pushing?');
        const defaultTargetBranch = await (0, prompts_1.promptInput)(rl, 'Default MR target branch (blank = branch you started from, else the project default)', { defaultValue: existingGitlab.defaultTargetBranch });
        gitlab = {
            ...existingGitlab,
            url: gitlabUrl || undefined,
            token: gitlabToken || existingGitlab.token || undefined,
            autoCreateMr,
            defaultTargetBranch: defaultTargetBranch || undefined,
        };
    }
    rl.close();
    const protectedBranches = protectedBranchesRaw
        .split(',')
        .map((branch) => branch.trim())
        .filter(Boolean);
    const updatedConfig = {
        ...existingConfig,
        jiraDomain,
        jiraEmail,
        jiraApiToken: jiraApiToken || existingConfig.jiraApiToken || '',
        jiraAssigneeId: jiraAssigneeId || '',
        jiraProjectId,
        jiraIssueTypeId,
        protectedBranches,
        branchPrefix: branchPrefix || undefined,
        gitlab,
    };
    const missing = (0, config_1.ensureRequiredConfig)(updatedConfig);
    if (missing.length) {
        (0, colors_1.printError)(`Missing required config values: ${missing.join(', ')}`);
        process.exit(1);
    }
    (0, config_1.writeConfig)(configPath, updatedConfig);
    (0, colors_1.printSuccess)('Config saved. You can now use jcommit command.');
}
async function mainWorkflow(config, configPath) {
    (0, colors_1.printSuccess)('Hi, ' + config.jiraEmail.split('@')[0]);
    (0, colors_1.printInfo)('Committing changes to git');
    (0, steps_1.assertGitRepo)();
    let currentBranch = (0, steps_1.requireCurrentBranch)();
    let baseBranchForMr = null;
    (0, colors_1.printInfo)(`You are on branch:`);
    (0, colors_1.printWarning)(`${currentBranch}`);
    const rl = promises_1.default.createInterface({
        input: process.stdin,
        output: process.stdout,
    });
    const branchAction = await (0, prompts_1.promptInput)(rl, 'Select branch action: [c]reate new branch from different branch, [s]witch branch, [u]se current branch', { required: true });
    const normalizedAction = branchAction.trim().toLowerCase();
    if (normalizedAction === 'c' || normalizedAction === 'create') {
        (0, colors_1.printInfo)('Available base branches:');
        const remoteBranches = (0, git_1.listRemoteBranches)();
        remoteBranches.forEach((branch) => console.log(`  - ${branch}`));
        const baseBranch = await (0, prompts_1.promptInput)(rl, 'Name of the source/base branch', { required: true });
        const newBranchName = await (0, prompts_1.promptInput)(rl, 'Name for the new branch', { required: true });
        if (!(0, git_1.createBranchFromBase)(baseBranch, newBranchName)) {
            rl.close();
            (0, colors_1.printError)(`Failed to create branch '${newBranchName}' from '${baseBranch}'`);
            process.exit(1);
        }
        if (!(0, git_1.switchBranch)(newBranchName)) {
            rl.close();
            (0, colors_1.printError)(`Failed to switch to newly created branch '${newBranchName}'`);
            process.exit(1);
        }
        currentBranch = newBranchName;
        baseBranchForMr = baseBranch;
        (0, colors_1.printSuccess)(`Created and switched to branch '${newBranchName}' from '${baseBranch}'`);
    }
    else if (normalizedAction === 's' || normalizedAction === 'switch') {
        (0, colors_1.printInfo)('Available local branches:');
        (0, git_1.listLocalBranches)().forEach((branch) => console.log(`  - ${branch}`));
        const targetBranchName = await (0, prompts_1.promptInput)(rl, 'Name of the local branch to checkout', {
            required: true,
        });
        if (!(0, git_1.switchBranch)(targetBranchName)) {
            rl.close();
            (0, colors_1.printError)(`Failed to switch to branch '${targetBranchName}'`);
            process.exit(1);
        }
        (0, colors_1.printSuccess)(`Switched to branch '${targetBranchName}'`);
        currentBranch = (0, git_1.getCurrentBranch)();
    }
    else if (normalizedAction !== 'u' && normalizedAction !== 'use') {
        rl.close();
        (0, colors_1.printError)('Invalid branch action. Use create, switch, or use current.');
        process.exit(1);
    }
    (0, steps_1.assertStagedChanges)();
    const protectedBranches = await (0, protected_1.loadProtectedBranches)(config, configPath);
    const workBranch = (0, protected_1.ensureWorkBranch)(currentBranch, config, protectedBranches.all);
    currentBranch = workBranch.branch;
    baseBranchForMr = workBranch.protectedBase || baseBranchForMr;
    const jiraService = new jira_1.JiraService(config);
    const openIssues = await jiraService.getOpenIssues(config.jiraAssigneeId);
    if (openIssues.length > 0) {
        console.log('');
        (0, colors_1.printInfo)('You have the following open Jira Work items:');
        openIssues.forEach((issue) => (0, colors_1.printWarning)(`${issue.id}: ${issue.summary}`));
        console.log('');
    }
    const userInput = await (0, prompts_1.promptInput)(rl, 'Enter commit message to create a new Jira ticket OR Enter existing Jira ticket key (e.g., PROJ-1234)', {
        required: true,
    });
    let summary = userInput;
    let commitMessage = '';
    let commitBody = '';
    let issueKey = '';
    let skipJiraCreation = false;
    if (/^[A-Za-z]+-[0-9]+$/.test(userInput)) {
        const jiraTicket = userInput;
        (0, colors_1.printInfo)('Fetching Jira work item details...');
        try {
            const { summary: jiraSummary, status: jiraStatus, priority: jiraPriority } = await jiraService.getIssue(jiraTicket);
            if (jiraSummary && jiraStatus) {
                console.log('');
                (0, colors_1.printInfo)('Found Jira work item:');
                console.log(`Ticket: ${jiraTicket}`);
                console.log(`Status: ${jiraStatus}`);
                console.log(`Summary: ${jiraSummary}`);
                console.log(`Priority: ${jiraPriority}`);
                console.log('');
                if (await (0, prompts_1.promptYesNo)(rl, 'Confirm: Use this Jira ticket for the commit message? [y]es or enter custom summary [n]: ')) {
                    commitMessage = `${jiraTicket} | Fix: ${jiraSummary}`;
                    issueKey = jiraTicket;
                    skipJiraCreation = true;
                }
                else {
                    const customSummary = await (0, prompts_1.promptInput)(rl, 'Enter custom commit message', {
                        required: true,
                    });
                    commitMessage = `${jiraTicket} | ${customSummary}`;
                    issueKey = jiraTicket;
                    skipJiraCreation = true;
                }
            }
            else {
                (0, colors_1.printWarning)('Failed to parse Jira issue details. Continuing with manual commit message...');
                summary = userInput;
            }
        }
        catch (error) {
            (0, colors_1.printError)('Failed to fetch Jira issue. Continuing with manual commit message...');
            summary = userInput;
        }
    }
    if (!skipJiraCreation) {
        const descriptionInput = await (0, prompts_1.promptInput)(rl, 'Provide a detailed description (or \'n\' to skip & use summary)');
        const description = /^(n|N)$/.test(descriptionInput) ? summary : descriptionInput || summary;
        commitBody = description;
        (0, colors_1.printInfo)('Creating Jira work item...');
        try {
            issueKey = await jiraService.createIssue(summary, description);
            (0, colors_1.printSuccess)(`Created Jira work item: ${issueKey}`);
            commitMessage = `${issueKey} | ${summary}`;
        }
        catch (error) {
            rl.close();
            (0, colors_1.printError)('Failed to create Jira work item');
            (0, colors_1.printError)(error.message);
            process.exit(1);
        }
    }
    rl.close();
    (0, steps_1.commitChanges)((0, steps_1.buildCommitMessage)(commitMessage, commitBody));
    const rlPush = promises_1.default.createInterface({
        input: process.stdin,
        output: process.stdout,
    });
    const autoMr = (0, mergeRequest_1.isAutoMrEnabled)(config);
    const pushQuestion = autoMr
        ? 'Push changes and create a GitLab merge request now? [y]es or [n]o: '
        : 'Push changes to the remote repository now? [y]es or [n]o: ';
    const pushed = await (0, prompts_1.promptYesNo)(rlPush, pushQuestion);
    rlPush.close();
    if (pushed) {
        await (0, mergeRequest_1.pushAndCreateMergeRequest)(config, {
            sourceBranch: currentBranch,
            baseBranch: baseBranchForMr,
            title: commitMessage,
            description: commitBody || commitMessage,
            jiraKey: issueKey || null,
            jiraUrl: issueKey ? jiraService.browseUrl(issueKey) : null,
        }, { createMr: autoMr, push: true });
    }
    else {
        (0, colors_1.printInfo)('Commit was not pushed to remote.');
    }
    (0, colors_1.printSuccess)('Committed successfully!');
}
//# sourceMappingURL=main.js.map