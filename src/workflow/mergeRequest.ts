import { GjCommitConfig } from '../types';
import { printError, printInfo, printSuccess, printWarning } from '../utils/colors';
import { getCurrentBranch, getRemoteDefaultBranch, runGit } from '../utils/git';
import { pushCurrentBranch } from './steps';
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

/** True when MRs can be created through the GitLab API (origin remote + URL + token). */
export function hasGitLabApiAccess(config: GjCommitConfig): boolean {
  const repo = getRepoContext();
  return Boolean(repo.remote && createGitLabService(config, repo.remote));
}

/**
 * Pushes the current branch and, when `createMr` is set, opens a merge request:
 * through the GitLab API when a token is available, otherwise with GitLab push
 * options on the push itself (uses the user's git credentials, no token).
 */
export async function pushAndCreateMergeRequest(
  config: GjCommitConfig,
  input: MergeRequestInput,
  options: { createMr: boolean; push: boolean }
): Promise<void> {
  if (!options.createMr) {
    if (options.push) {
      pushCurrentBranch();
    }
    return;
  }
  if (hasGitLabApiAccess(config)) {
    if (options.push) {
      pushCurrentBranch();
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
export function buildSingleLineDescription(input: MergeRequestInput): string {
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

export function buildPushOptions(config: GjCommitConfig, input: MergeRequestInput): string[] {
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

function pushWithMergeRequestOptions(config: GjCommitConfig, input: MergeRequestInput): void {
  const branch = getCurrentBranch();
  const pushOptions = buildPushOptions(config, input);
  printInfo('No GitLab token — creating the merge request with git push options.');
  printInfo('Pushing to remote...');

  const args = ['push', ...pushOptions.flatMap((option) => ['-o', option]), '--set-upstream', 'origin', branch];
  // Capture stderr (where git relays the remote's messages) to find the MR link, then echo it.
  const result = runGit(args, { stdio: ['inherit', 'inherit', 'pipe'] });
  process.stderr.write(result.stderr);

  if (result.status !== 0) {
    if (/does not support push options/i.test(result.stderr)) {
      printWarning('The remote does not support push options; pushing without creating a merge request.');
      pushCurrentBranch();
      printError('Merge request not created. Set a GitLab token (GITLAB_TOKEN or gitlab.token) to create it via the API.');
      process.exitCode = 1;
      return;
    }
    printError('Git push failed');
    process.exit(1);
  }
  printSuccess('Git push successful');

  const ignored = unsupportedSettingsNote(config);
  if (ignored) {
    printWarning(ignored);
  }

  const mrUrl = result.stderr.match(MR_URL_PATTERN)?.[0];
  if (mrUrl) {
    printSuccess(`Merge request: ${mrUrl}`);
  } else if (/Everything up-to-date/i.test(result.stderr)) {
    printWarning(
      'Nothing new was pushed, so GitLab did not process the merge request options. ' +
        'Set a GitLab token to create the MR via the API.'
    );
    process.exitCode = 1;
  } else {
    printWarning('GitLab did not report a merge request link — check the remote is GitLab and look for the MR there.');
  }
}

function unsupportedSettingsNote(config: GjCommitConfig): string {
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
