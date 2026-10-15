"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isAutoMrEnabled = isAutoMrEnabled;
exports.createMergeRequest = createMergeRequest;
const colors_1 = require("../utils/colors");
const git_1 = require("../utils/git");
const protected_1 = require("./protected");
function isAutoMrEnabled(config) {
    return config.gitlab?.autoCreateMr === true;
}
function buildDescription(input) {
    const parts = [input.description.trim()];
    if (input.jiraKey) {
        parts.push(`---\nJira: [${input.jiraKey}](${input.jiraUrl || input.jiraKey})`);
    }
    return parts.filter(Boolean).join('\n\n');
}
/**
 * Opens a GitLab merge request for the pushed branch. Reuses an already open MR
 * for the same source branch instead of creating a duplicate. Failures are
 * reported and set a non-zero exit code, but never undo the commit/push.
 */
async function createMergeRequest(config, input) {
    const repo = (0, protected_1.getRepoContext)();
    if (!repo.remote) {
        (0, colors_1.printError)('Cannot create a merge request: no `origin` remote found.');
        process.exitCode = 1;
        return;
    }
    const gitlab = (0, protected_1.createGitLabService)(config, repo.remote);
    if (!gitlab) {
        (0, colors_1.printError)('Cannot create a merge request: GitLab token missing. Set `gitlab.token` ' +
            '(jcommit config set gitlab.token <token>) or export GITLAB_TOKEN.');
        process.exitCode = 1;
        return;
    }
    const projectPath = (0, protected_1.getGitLabProjectPath)(config, repo.remote);
    try {
        const existing = await gitlab.findOpenMergeRequest(projectPath, input.sourceBranch);
        if (existing) {
            (0, colors_1.printInfo)(`An open merge request already exists for '${input.sourceBranch}' (!${existing.iid}).`);
            (0, colors_1.printSuccess)(`MR: ${existing.web_url}`);
            return;
        }
        let targetBranch = input.targetBranch || input.baseBranch || config.gitlab?.defaultTargetBranch || '';
        if (!targetBranch) {
            targetBranch = (await gitlab.getDefaultBranch(projectPath)) || (0, git_1.getRemoteDefaultBranch)();
        }
        if (!targetBranch) {
            (0, colors_1.printError)('Cannot create a merge request: could not determine the target branch. Pass --target <branch>.');
            process.exitCode = 1;
            return;
        }
        if (targetBranch === input.sourceBranch) {
            (0, colors_1.printWarning)(`Skipping merge request: source and target are both '${targetBranch}'.`);
            return;
        }
        const title = config.gitlab?.draft ? `Draft: ${input.title}` : input.title;
        (0, colors_1.printInfo)(`Creating GitLab merge request ${input.sourceBranch} → ${targetBranch}...`);
        const mergeRequest = await gitlab.createMergeRequest(projectPath, {
            sourceBranch: input.sourceBranch,
            targetBranch,
            title,
            description: buildDescription(input),
            removeSourceBranch: config.gitlab?.removeSourceBranch !== false,
            squash: config.gitlab?.squash === true,
            labels: config.gitlab?.labels,
            assigneeIds: config.gitlab?.assigneeIds,
            reviewerIds: config.gitlab?.reviewerIds,
        });
        (0, colors_1.printSuccess)(`Created merge request !${mergeRequest.iid}: ${mergeRequest.web_url}`);
    }
    catch (error) {
        (0, colors_1.printError)('Failed to create GitLab merge request');
        (0, colors_1.printError)(error.message);
        process.exitCode = 1;
    }
}
//# sourceMappingURL=mergeRequest.js.map