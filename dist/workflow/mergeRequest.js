"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isAutoMrEnabled = isAutoMrEnabled;
exports.hasGitLabApiAccess = hasGitLabApiAccess;
exports.pushAndCreateMergeRequest = pushAndCreateMergeRequest;
exports.buildSingleLineDescription = buildSingleLineDescription;
exports.buildPushOptions = buildPushOptions;
exports.createMergeRequest = createMergeRequest;
const colors_1 = require("../utils/colors");
const git_1 = require("../utils/git");
const steps_1 = require("./steps");
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
/** True when MRs can be created through the GitLab API (origin remote + URL + token). */
function hasGitLabApiAccess(config) {
    const repo = (0, protected_1.getRepoContext)();
    return Boolean(repo.remote && (0, protected_1.createGitLabService)(config, repo.remote));
}
/**
 * Pushes the current branch and, when `createMr` is set, opens a merge request:
 * through the GitLab API when a token is available, otherwise with GitLab push
 * options on the push itself (uses the user's git credentials, no token).
 */
async function pushAndCreateMergeRequest(config, input, options) {
    if (!options.createMr) {
        if (options.push) {
            (0, steps_1.pushCurrentBranch)();
        }
        return;
    }
    if (hasGitLabApiAccess(config)) {
        if (options.push) {
            (0, steps_1.pushCurrentBranch)();
        }
        await createMergeRequest(config, input);
        return;
    }
    // Push options only take effect on a push, so this path always pushes.
    pushWithMergeRequestOptions(config, input);
}
/**
 * Summary paragraph (or first paragraph) of the description flattened to one
 * line, plus the Jira link. Git refuses push options containing newlines, so the
 * full multi-line description stays in the commit body only.
 */
function buildSingleLineDescription(input) {
    const body = input.description.trim();
    const summarySection = body.match(/^#{1,6}\s*Summary\s*\n([\s\S]*?)(?=\n#{1,6}\s|(?![\s\S]))/im);
    const firstParagraph = (summarySection ? summarySection[1] : body)
        .trim()
        .split(/\n\s*\n/)[0]
        .replace(/^#{1,6}\s+.*$/gm, '')
        .replace(/\s+/g, ' ')
        .trim();
    const summary = firstParagraph && firstParagraph !== input.title ? firstParagraph : '';
    const jira = input.jiraKey ? `Jira: [${input.jiraKey}](${input.jiraUrl || input.jiraKey})` : '';
    return [summary, jira, 'Full description: see the commit message.'].filter(Boolean).join(' — ');
}
function buildPushOptions(config, input) {
    const target = input.targetBranch || input.baseBranch || config.gitlab?.defaultTargetBranch || '';
    const title = config.gitlab?.draft ? `Draft: ${input.title}` : input.title;
    const pushOptions = [
        'merge_request.create',
        `merge_request.title=${title}`,
        `merge_request.description=${buildSingleLineDescription(input)}`,
    ];
    // No target → GitLab uses the project's default branch.
    if (target) {
        pushOptions.push(`merge_request.target=${target}`);
    }
    if (config.gitlab?.removeSourceBranch !== false) {
        pushOptions.push('merge_request.remove_source_branch');
    }
    if (config.gitlab?.draft) {
        pushOptions.push('merge_request.draft');
    }
    (config.gitlab?.labels || []).forEach((label) => pushOptions.push(`merge_request.label=${label}`));
    (config.gitlab?.assigneeIds || []).forEach((id) => pushOptions.push(`merge_request.assign=${id}`));
    return pushOptions.map((option) => option.replace(/[\r\n]+/g, ' '));
}
const MR_URL_PATTERN = /https?:\/\/\S+\/-\/merge_requests\/\d+/;
function pushWithMergeRequestOptions(config, input) {
    const branch = (0, git_1.getCurrentBranch)();
    const pushOptions = buildPushOptions(config, input);
    (0, colors_1.printInfo)('No GitLab token — creating the merge request with git push options.');
    (0, colors_1.printInfo)('Pushing to remote...');
    const args = ['push', ...pushOptions.flatMap((option) => ['-o', option]), '--set-upstream', 'origin', branch];
    // Capture stderr (where git relays the remote's messages) to find the MR link, then echo it.
    const result = (0, git_1.runGit)(args, { stdio: ['inherit', 'inherit', 'pipe'] });
    process.stderr.write(result.stderr);
    if (result.status !== 0) {
        if (/does not support push options/i.test(result.stderr)) {
            (0, colors_1.printWarning)('The remote does not support push options; pushing without creating a merge request.');
            (0, steps_1.pushCurrentBranch)();
            (0, colors_1.printError)('Merge request not created. Set a GitLab token (GITLAB_TOKEN or gitlab.token) to create it via the API.');
            process.exitCode = 1;
            return;
        }
        (0, colors_1.printError)('Git push failed');
        process.exit(1);
    }
    (0, colors_1.printSuccess)('Git push successful');
    const ignored = unsupportedSettingsNote(config);
    if (ignored) {
        (0, colors_1.printWarning)(ignored);
    }
    const mrUrl = result.stderr.match(MR_URL_PATTERN)?.[0];
    if (mrUrl) {
        (0, colors_1.printSuccess)(`Merge request: ${mrUrl}`);
    }
    else if (/Everything up-to-date/i.test(result.stderr)) {
        (0, colors_1.printWarning)('Nothing new was pushed, so GitLab did not process the merge request options. ' +
            'Set a GitLab token to create the MR via the API.');
        process.exitCode = 1;
    }
    else {
        (0, colors_1.printWarning)('GitLab did not report a merge request link — check the remote is GitLab and look for the MR there.');
    }
}
function unsupportedSettingsNote(config) {
    const ignored = [
        config.gitlab?.reviewerIds?.length ? 'gitlab.reviewerIds' : '',
        config.gitlab?.squash ? 'gitlab.squash' : '',
    ].filter(Boolean);
    return ignored.length
        ? `${ignored.join(' and ')} need a GitLab token; push options cannot set them.`
        : '';
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