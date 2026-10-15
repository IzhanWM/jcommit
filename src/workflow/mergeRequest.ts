import { GjCommitConfig } from '../types';
import { printError, printInfo, printSuccess, printWarning } from '../utils/colors';
import { getRemoteDefaultBranch } from '../utils/git';
import { createGitLabService, getGitLabProjectPath, getRepoContext } from './protected';

export interface MergeRequestInput {
  sourceBranch: string;
  /** Explicit target (--target). */
  targetBranch?: string | null;
  /** Branch the work branch was created from (auto-branch or --create-branch base). */
  baseBranch?: string | null;
  title: string;
  description: string;
  jiraKey?: string | null;
  jiraUrl?: string | null;
}

export function isAutoMrEnabled(config: GjCommitConfig): boolean {
  return config.gitlab?.autoCreateMr === true;
}

function buildDescription(input: MergeRequestInput): string {
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
export async function createMergeRequest(config: GjCommitConfig, input: MergeRequestInput): Promise<void> {
  const repo = getRepoContext();
  if (!repo.remote) {
    printError('Cannot create a merge request: no `origin` remote found.');
    process.exitCode = 1;
    return;
  }

  const gitlab = createGitLabService(config, repo.remote);
  if (!gitlab) {
    printError(
      'Cannot create a merge request: GitLab token missing. Set `gitlab.token` ' +
        '(jcommit config set gitlab.token <token>) or export GITLAB_TOKEN.'
    );
    process.exitCode = 1;
    return;
  }

  const projectPath = getGitLabProjectPath(config, repo.remote);

  try {
    const existing = await gitlab.findOpenMergeRequest(projectPath, input.sourceBranch);
    if (existing) {
      printInfo(`An open merge request already exists for '${input.sourceBranch}' (!${existing.iid}).`);
      printSuccess(`MR: ${existing.web_url}`);
      return;
    }

    let targetBranch =
      input.targetBranch || input.baseBranch || config.gitlab?.defaultTargetBranch || '';
    if (!targetBranch) {
      targetBranch = (await gitlab.getDefaultBranch(projectPath)) || getRemoteDefaultBranch();
    }
    if (!targetBranch) {
      printError('Cannot create a merge request: could not determine the target branch. Pass --target <branch>.');
      process.exitCode = 1;
      return;
    }
    if (targetBranch === input.sourceBranch) {
      printWarning(`Skipping merge request: source and target are both '${targetBranch}'.`);
      return;
    }

    const title = config.gitlab?.draft ? `Draft: ${input.title}` : input.title;
    printInfo(`Creating GitLab merge request ${input.sourceBranch} → ${targetBranch}...`);
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
    printSuccess(`Created merge request !${mergeRequest.iid}: ${mergeRequest.web_url}`);
  } catch (error) {
    printError('Failed to create GitLab merge request');
    printError((error as Error).message);
    process.exitCode = 1;
  }
}
