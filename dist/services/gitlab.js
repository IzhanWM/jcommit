"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GitLabService = void 0;
exports.parseRemoteUrl = parseRemoteUrl;
/**
 * Parses the host and project path out of a git remote URL. Handles the forms
 * GitLab hands out: `git@host:group/sub/project.git`,
 * `ssh://git@host:2222/group/project.git` and `https://host/group/project.git`.
 */
function parseRemoteUrl(remoteUrl) {
    const url = remoteUrl.trim();
    if (!url) {
        return null;
    }
    const scpLike = url.match(/^(?:[^@/]+@)?([^:/]+):(?!\/)(.+)$/);
    if (scpLike && !/^[a-z]+:\/\//i.test(url)) {
        return { host: scpLike[1], projectPath: stripGitSuffix(scpLike[2]) };
    }
    try {
        const parsed = new URL(url);
        const projectPath = stripGitSuffix(parsed.pathname.replace(/^\/+/, ''));
        if (!parsed.hostname || !projectPath) {
            return null;
        }
        return { host: parsed.hostname, projectPath };
    }
    catch {
        return null;
    }
}
function stripGitSuffix(projectPath) {
    return projectPath.replace(/\/+$/, '').replace(/\.git$/, '');
}
class GitLabService {
    apiBase;
    token;
    constructor(baseUrl, token) {
        this.apiBase = `${baseUrl.replace(/\/+$/, '')}/api/v4`;
        this.token = token;
    }
    projectUrl(projectPath) {
        return `${this.apiBase}/projects/${encodeURIComponent(projectPath)}`;
    }
    async request(url, init = {}) {
        const response = await fetch(url, {
            ...init,
            headers: {
                'PRIVATE-TOKEN': this.token,
                Accept: 'application/json',
                ...(init.body ? { 'Content-Type': 'application/json' } : {}),
                ...init.headers,
            },
        });
        const text = await response.text();
        if (!response.ok) {
            throw new Error(`GitLab API ${response.status}: ${text || response.statusText}`);
        }
        return (text ? JSON.parse(text) : null);
    }
    /** Protected branch names or wildcard patterns (e.g. `release-*`) for the project. */
    async getProtectedBranches(projectPath) {
        const branches = [];
        for (let page = 1; page <= 10; page += 1) {
            const batch = await this.request(`${this.projectUrl(projectPath)}/protected_branches?per_page=100&page=${page}`);
            branches.push(...batch.map((branch) => branch.name));
            if (batch.length < 100) {
                break;
            }
        }
        return branches;
    }
    async getDefaultBranch(projectPath) {
        const project = await this.request(this.projectUrl(projectPath));
        return project.default_branch || '';
    }
    async findOpenMergeRequest(projectPath, sourceBranch) {
        const params = new URLSearchParams({ state: 'opened', source_branch: sourceBranch });
        const existing = await this.request(`${this.projectUrl(projectPath)}/merge_requests?${params.toString()}`);
        return existing[0] || null;
    }
    async createMergeRequest(projectPath, input) {
        const body = {
            source_branch: input.sourceBranch,
            target_branch: input.targetBranch,
            title: input.title,
            description: input.description,
            remove_source_branch: input.removeSourceBranch,
            squash: input.squash,
        };
        if (input.labels?.length) {
            body.labels = input.labels.join(',');
        }
        if (input.assigneeIds?.length) {
            body.assignee_ids = input.assigneeIds;
        }
        if (input.reviewerIds?.length) {
            body.reviewer_ids = input.reviewerIds;
        }
        return this.request(`${this.projectUrl(projectPath)}/merge_requests`, {
            method: 'POST',
            body: JSON.stringify(body),
        });
    }
}
exports.GitLabService = GitLabService;
//# sourceMappingURL=gitlab.js.map