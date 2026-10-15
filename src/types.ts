export interface GitLabConfig {
  /** GitLab base URL, e.g. https://gitlab.wavemaker.com. Defaults to the host of the `origin` remote. */
  url?: string;
  /** Personal access token with `api` scope. Falls back to $GITLAB_TOKEN. */
  token?: string;
  /** Create a merge request automatically after a successful push. */
  autoCreateMr?: boolean;
  /** Default MR target branch. Defaults to the protected branch we branched from, then the project default branch. */
  defaultTargetBranch?: string;
  /** Delete the source branch when the MR is merged (default: true). */
  removeSourceBranch?: boolean;
  /** Squash commits when the MR is merged (default: false). */
  squash?: boolean;
  /** Open the MR as a draft (default: false). */
  draft?: boolean;
  /** Labels added to every MR jcommit creates. */
  labels?: string[];
  /** Numeric GitLab user IDs to assign / request review from. */
  assigneeIds?: number[];
  reviewerIds?: number[];
}

export interface ProtectedBranchCacheEntry {
  /** Branch names or wildcard patterns (e.g. `release-*`) as reported by GitLab. */
  branches: string[];
  /** Where the list came from. */
  source: 'gitlab' | 'remote-default';
  fetchedAt: string;
}

export interface GjCommitConfig {
  jiraDomain: string;
  jiraEmail: string;
  jiraApiToken: string;
  jiraAssigneeId?: string;
  jiraProjectId: string;
  jiraIssueTypeId: string;
  protectedBranches?: string[];
  /** Prefix for auto-created branches (`<prefix>/<branch>`). Defaults to the local part of jiraEmail. */
  branchPrefix?: string;
  /** Automatically move to `<prefix>/<branch>` when committing on a protected branch (default: true). */
  autoBranchOnProtected?: boolean;
  /** Hours before cached protected branches are refreshed from GitLab (default: 24). */
  protectedBranchCacheTtlHours?: number;
  /** Protected branches detected per repository, keyed by `<host>/<project path>`. Managed by jcommit. */
  protectedBranchCache?: Record<string, ProtectedBranchCacheEntry>;
  gitlab?: GitLabConfig;
}

export interface ParsedArgs {
  command: string | null;
  commandArgs: string[];
  configPath: string | null;
  help: boolean;
  version: boolean;
  headless: boolean;
  message: string | null;
  ticket: string | null;
  description: string | null;
  descriptionFile: string | null;
  switchBranch: string | null;
  createBranch: string | null;
  baseBranch: string | null;
  push: boolean | null;
  mr: boolean | null;
  targetBranch: string | null;
  refreshProtected: boolean;
}

export interface HeadlessOptions {
  message: string | null;
  ticket: string | null;
  description: string | null;
  switchBranch: string | null;
  createBranch: string | null;
  baseBranch: string | null;
  push: boolean | null;
  mr: boolean | null;
  targetBranch: string | null;
  refreshProtected: boolean;
}

export interface JiraIssue {
  id: string;
  summary: string;
  status: string;
  priority: string;
}

export interface AdfNode {
  type: string;
  attrs?: Record<string, unknown>;
  text?: string;
  content?: AdfNode[];
}

export interface JiraCreateRequest {
  fields: {
    description: {
      type: 'doc';
      version: number;
      content: AdfNode[];
    };
    issuetype: { id: string };
    project: { id: string };
    summary: string;
    assignee?: { accountId: string };
  };
  update: Record<string, never>;
}

export interface JiraCreateResponse {
  key: string;
}

export interface GitLabMergeRequest {
  iid: number;
  web_url: string;
  title: string;
  target_branch: string;
  source_branch: string;
}

export interface PromptOptions {
  required?: boolean;
  defaultValue?: string;
}

export interface SecretPromptOptions {
  allowEmpty?: boolean;
  hasExisting?: boolean;
}

export type ColorType = 'red' | 'green' | 'yellow' | 'blue' | 'reset';
