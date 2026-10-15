import { GitLabMergeRequest } from '../types';

export interface RemoteInfo {
  host: string;
  projectPath: string;
}

/**
 * Parses the host and project path out of a git remote URL. Handles the forms
 * GitLab hands out: `git@host:group/sub/project.git`,
 * `ssh://git@host:2222/group/project.git` and `https://host/group/project.git`.
 */
export function parseRemoteUrl(remoteUrl: string): RemoteInfo | null {
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
  } catch {
    return null;
  }
}

function stripGitSuffix(projectPath: string): string {
  return projectPath.replace(/\/+$/, '').replace(/\.git$/, '');
}

export interface CreateMergeRequestInput {
  sourceBranch: string;
  targetBranch: string;
  title: string;
  description: string;
  removeSourceBranch: boolean;
  squash: boolean;
  labels?: string[];
  assigneeIds?: number[];
  reviewerIds?: number[];
}

export class GitLabService {
  private apiBase: string;
  private token: string;

  constructor(baseUrl: string, token: string) {
    this.apiBase = `${baseUrl.replace(/\/+$/, '')}/api/v4`;
    this.token = token;
  }

  private projectUrl(projectPath: string): string {
    return `${this.apiBase}/projects/${encodeURIComponent(projectPath)}`;
  }

  private async request<T>(url: string, init: RequestInit = {}): Promise<T> {
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
    return (text ? JSON.parse(text) : null) as T;
  }

  /** Protected branch names or wildcard patterns (e.g. `release-*`) for the project. */
  async getProtectedBranches(projectPath: string): Promise<string[]> {
    const branches: string[] = [];
    for (let page = 1; page <= 10; page += 1) {
      const batch = await this.request<Array<{ name: string }>>(
        `${this.projectUrl(projectPath)}/protected_branches?per_page=100&page=${page}`
      );
      branches.push(...batch.map((branch) => branch.name));
      if (batch.length < 100) {
        break;
      }
    }
    return branches;
  }

  async getDefaultBranch(projectPath: string): Promise<string> {
    const project = await this.request<{ default_branch?: string }>(this.projectUrl(projectPath));
    return project.default_branch || '';
  }

  async findOpenMergeRequest(projectPath: string, sourceBranch: string): Promise<GitLabMergeRequest | null> {
    const params = new URLSearchParams({ state: 'opened', source_branch: sourceBranch });
    const existing = await this.request<GitLabMergeRequest[]>(
      `${this.projectUrl(projectPath)}/merge_requests?${params.toString()}`
    );
    return existing[0] || null;
  }

  async createMergeRequest(projectPath: string, input: CreateMergeRequestInput): Promise<GitLabMergeRequest> {
    const body: Record<string, unknown> = {
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
    return this.request<GitLabMergeRequest>(`${this.projectUrl(projectPath)}/merge_requests`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }
}
