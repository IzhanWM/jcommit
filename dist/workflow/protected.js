"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRepoContext = getRepoContext;
exports.getGitLabBaseUrl = getGitLabBaseUrl;
exports.getGitLabProjectPath = getGitLabProjectPath;
exports.createGitLabService = createGitLabService;
exports.loadProtectedBranches = loadProtectedBranches;
exports.matchesBranchPattern = matchesBranchPattern;
exports.isProtectedBranch = isProtectedBranch;
exports.getBranchPrefix = getBranchPrefix;
exports.ensureWorkBranch = ensureWorkBranch;
exports.printProtectedBranches = printProtectedBranches;
const colors_1 = require("../utils/colors");
const git_1 = require("../utils/git");
const gitlab_1 = require("../services/gitlab");
const config_1 = require("../config/config");
function getRepoContext() {
    const remote = (0, gitlab_1.parseRemoteUrl)((0, git_1.getRemoteUrl)());
    if (remote) {
        return { key: `${remote.host}/${remote.projectPath}`, remote };
    }
    return { key: `local:${(0, git_1.getRepoRoot)()}`, remote: null };
}
function getGitLabBaseUrl(config, remote) {
    if (config.gitlab?.url) {
        return config.gitlab.url;
    }
    return remote ? `https://${remote.host}` : '';
}
/**
 * GitLab project path for the API. If `gitlab.url` is served under a sub-path
 * (e.g. https://host/gitlab) and the remote path repeats it, strip it.
 */
function getGitLabProjectPath(config, remote) {
    if (!config.gitlab?.url) {
        return remote.projectPath;
    }
    try {
        const prefix = new URL(config.gitlab.url).pathname.replace(/^\/+|\/+$/g, '');
        if (prefix && remote.projectPath.startsWith(`${prefix}/`)) {
            return remote.projectPath.slice(prefix.length + 1);
        }
    }
    catch {
        // Invalid URL: fall through and use the remote path as-is.
    }
    return remote.projectPath;
}
function createGitLabService(config, remote) {
    const baseUrl = getGitLabBaseUrl(config, remote);
    const token = config.gitlab?.token;
    if (!baseUrl || !token) {
        return null;
    }
    return new gitlab_1.GitLabService(baseUrl, token);
}
function isCacheFresh(entry, ttlHours) {
    if (!entry) {
        return false;
    }
    const age = Date.now() - new Date(entry.fetchedAt).getTime();
    return Number.isFinite(age) && age < ttlHours * 60 * 60 * 1000;
}
async function detectProtectedBranches(config, repo) {
    const fetchedAt = new Date().toISOString();
    const gitlab = repo.remote ? createGitLabService(config, repo.remote) : null;
    if (gitlab && repo.remote) {
        try {
            const branches = await gitlab.getProtectedBranches(getGitLabProjectPath(config, repo.remote));
            return { branches, source: 'gitlab', fetchedAt };
        }
        catch (error) {
            (0, colors_1.printWarning)(`Could not read protected branches from GitLab: ${error.message}`);
        }
    }
    // Without GitLab access, the remote's default branch is the one branch we can be
    // sure is protected.
    if (repo.remote) {
        const defaultBranch = (0, git_1.getRemoteDefaultBranch)();
        if (defaultBranch) {
            return { branches: [defaultBranch], source: 'remote-default', fetchedAt };
        }
    }
    return null;
}
/**
 * Returns the protected branches for the current repository: the configured list
 * plus the branches detected from GitLab (or the remote default branch). Detected
 * branches are stored per repository in the config file and refreshed once the
 * cache is older than `protectedBranchCacheTtlHours`.
 */
async function loadProtectedBranches(config, configPath, options = {}) {
    const configured = Array.isArray(config.protectedBranches) && config.protectedBranches.length
        ? config.protectedBranches
        : (0, config_1.getDefaultProtectedBranches)();
    const repo = getRepoContext();
    let entry = config.protectedBranchCache?.[repo.key];
    if (options.refresh || !isCacheFresh(entry, (0, config_1.getProtectedCacheTtlHours)(config))) {
        const detected = await detectProtectedBranches(config, repo);
        if (detected) {
            entry = detected;
            config.protectedBranchCache = { ...config.protectedBranchCache, [repo.key]: detected };
            try {
                (0, config_1.updateStoredConfig)(configPath, (stored) => {
                    stored.protectedBranchCache = { ...stored.protectedBranchCache, [repo.key]: detected };
                });
            }
            catch (error) {
                (0, colors_1.printWarning)(`Could not store protected branches in ${configPath}: ${error.message}`);
            }
        }
    }
    const detectedBranches = entry?.branches || [];
    return {
        configured,
        detected: detectedBranches,
        source: entry?.source || null,
        fetchedAt: entry?.fetchedAt || null,
        all: [...new Set([...configured, ...detectedBranches])],
    };
}
/** Matches a branch against a protected name or GitLab wildcard pattern (`release-*`). */
function matchesBranchPattern(branch, pattern) {
    if (!pattern.includes('*')) {
        return branch === pattern;
    }
    const regex = new RegExp(`^${pattern.split('*').map(escapeRegExp).join('.*')}$`);
    return regex.test(branch);
}
function escapeRegExp(value) {
    return value.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
}
function isProtectedBranch(branch, protectedBranches) {
    return protectedBranches.some((pattern) => matchesBranchPattern(branch, pattern));
}
function sanitizeRefSegment(value) {
    return value
        .toLowerCase()
        .replace(/[^a-z0-9._-]+/g, '-')
        .replace(/^[-.]+|[-.]+$/g, '')
        .replace(/\.{2,}/g, '.');
}
/** Prefix for auto-created branches: `branchPrefix`, else the Jira email's local part, else git user.name. */
function getBranchPrefix(config) {
    const candidates = [
        config.branchPrefix,
        config.jiraEmail?.split('@')[0],
        (0, git_1.runGit)(['config', 'user.name']).stdout.trim(),
    ];
    for (const candidate of candidates) {
        const prefix = candidate ? sanitizeRefSegment(candidate) : '';
        if (prefix) {
            return prefix;
        }
    }
    return 'dev';
}
function nextFreeBranchName(baseName) {
    let candidate = baseName;
    for (let suffix = 2; (0, git_1.localBranchExists)(candidate) || (0, git_1.remoteBranchExists)(candidate); suffix += 1) {
        candidate = `${baseName}-${suffix}`;
    }
    return candidate;
}
/**
 * Makes sure we never commit to a protected branch. When the current branch is
 * protected, a work branch `<prefix>/<branch>` is created from it (staged changes
 * carry over) unless `autoBranchOnProtected` is false, in which case we abort.
 */
function ensureWorkBranch(currentBranch, config, protectedBranches) {
    if (!isProtectedBranch(currentBranch, protectedBranches)) {
        return { branch: currentBranch, protectedBase: null };
    }
    if (config.autoBranchOnProtected === false) {
        (0, colors_1.printError)(`Operation cancelled. '${currentBranch}' is protected.`);
        process.exit(1);
    }
    const branch = nextFreeBranchName(`${getBranchPrefix(config)}/${currentBranch}`);
    (0, colors_1.printWarning)(`'${currentBranch}' is protected — moving your work to a new branch '${branch}'.`);
    if (!(0, git_1.createAndSwitchBranch)(branch)) {
        (0, colors_1.printError)(`Failed to create branch '${branch}' from protected branch '${currentBranch}'.`);
        process.exit(1);
    }
    (0, colors_1.printSuccess)(`Created and switched to branch '${branch}' from '${currentBranch}'`);
    return { branch, protectedBase: currentBranch };
}
function printProtectedBranches(result, repoKey) {
    (0, colors_1.printInfo)(`Protected branches for ${repoKey}:`);
    console.log(`  configured: ${result.configured.join(', ') || '(none)'}`);
    const detectedLabel = result.source === 'gitlab' ? 'GitLab' : result.source === 'remote-default' ? 'remote default branch' : 'not detected';
    console.log(`  detected (${detectedLabel}): ${result.detected.join(', ') || '(none)'}`);
    if (result.fetchedAt) {
        console.log(`  last checked: ${result.fetchedAt}`);
    }
}
//# sourceMappingURL=protected.js.map