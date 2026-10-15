import { GjCommitConfig, HeadlessOptions } from '../types';
import { printError, printInfo, printSuccess } from '../utils/colors';
import { createBranchFromBase, getCurrentBranch, switchBranch } from '../utils/git';
import { JiraService } from '../services/jira';
import {
  assertGitRepo,
  assertStagedChanges,
  buildCommitMessage,
  commitChanges,
  requireCurrentBranch,
  warnIfLongDescription,
} from './steps';
import { ensureWorkBranch, loadProtectedBranches } from './protected';
import { isAutoMrEnabled, pushAndCreateMergeRequest } from './mergeRequest';

const JIRA_KEY_PATTERN = /^[A-Za-z]+-[0-9]+$/;

function validateOptions(options: HeadlessOptions): void {
  // Valid issue inputs: --ticket alone (reuse issue), --message alone (create
  // issue), or both (reuse issue with a custom commit message). Neither is invalid.
  if (!options.message && !options.ticket) {
    printError(
      'Headless mode needs a Jira issue. Pass --ticket <KEY> to use an existing issue ' +
        'or --message <text> to create one.'
    );
    process.exit(1);
  }

  if (options.ticket && !JIRA_KEY_PATTERN.test(options.ticket)) {
    printError(`Invalid Jira ticket key: '${options.ticket}'. Expected a key like PROJ-123.`);
    process.exit(1);
  }

  if (options.message && /[\r\n]/.test(options.message)) {
    printError('--message must be a single line (the title). Put details in --description / --description-file.');
    process.exit(1);
  }

  if (options.createBranch && options.switchBranch) {
    printError('Cannot use --create-branch and --branch together. Choose one branch action.');
    process.exit(1);
  }

  if (options.createBranch && !options.baseBranch) {
    printError('--create-branch requires --base <branch> to create the new branch from.');
    process.exit(1);
  }

  if (options.baseBranch && !options.createBranch) {
    printError('--base only applies to --create-branch. Add --create-branch <name>.');
    process.exit(1);
  }

  if (options.mr === true && options.push === false) {
    printError('--mr needs the branch on the remote. Drop --no-push.');
    process.exit(1);
  }

  if (options.targetBranch && options.mr === false) {
    printError('--target only applies when a merge request is created. Drop --no-mr.');
    process.exit(1);
  }
}

function resolveBranch(options: HeadlessOptions, currentBranch: string): string {
  if (options.createBranch) {
    const base = options.baseBranch as string;
    if (!createBranchFromBase(base, options.createBranch)) {
      printError(`Failed to create branch '${options.createBranch}' from '${base}'`);
      process.exit(1);
    }
    if (!switchBranch(options.createBranch)) {
      printError(`Failed to switch to newly created branch '${options.createBranch}'`);
      process.exit(1);
    }
    printSuccess(`Created and switched to branch '${options.createBranch}' from '${base}'`);
    return options.createBranch;
  }

  if (options.switchBranch) {
    if (!switchBranch(options.switchBranch)) {
      printError(`Failed to switch to branch '${options.switchBranch}'`);
      process.exit(1);
    }
    printSuccess(`Switched to branch '${options.switchBranch}'`);
    return getCurrentBranch() || options.switchBranch;
  }

  return currentBranch;
}

interface ResolvedIssue {
  key: string;
  subject: string;
}

async function resolveIssue(jiraService: JiraService, options: HeadlessOptions): Promise<ResolvedIssue> {
  if (options.ticket) {
    if (options.message) {
      return { key: options.ticket, subject: `${options.ticket} | ${options.message}` };
    }

    printInfo('Fetching Jira work item details...');
    const { summary, status } = await jiraService.getIssue(options.ticket);
    if (!summary) {
      printError(`Could not read a summary for ${options.ticket}.`);
      process.exit(1);
    }
    printInfo(`Using ${options.ticket} (${status || 'unknown status'}): ${summary}`);
    return { key: options.ticket, subject: `${options.ticket} | Fix: ${summary}` };
  }

  const summary = options.message as string;
  const description = options.description || summary;
  printInfo('Creating Jira work item...');
  const issueKey = await jiraService.createIssue(summary, description);
  printSuccess(`Created Jira work item: ${issueKey}`);
  return { key: issueKey, subject: `${issueKey} | ${summary}` };
}

export async function runHeadless(
  config: GjCommitConfig,
  configPath: string,
  options: HeadlessOptions
): Promise<void> {

  validateOptions(options);
  warnIfLongDescription(options.description);

  assertGitRepo();
  let currentBranch = requireCurrentBranch();
  printInfo(`Branch: ${currentBranch}`);

  currentBranch = resolveBranch(options, currentBranch);

  assertStagedChanges();

  const protectedBranches = await loadProtectedBranches(config, configPath, {
    refresh: options.refreshProtected,
  });
  const workBranch = ensureWorkBranch(currentBranch, config, protectedBranches.all);
  currentBranch = workBranch.branch;

  const jiraService = new JiraService(config);
  const issue = await resolveIssue(jiraService, options);

  commitChanges(buildCommitMessage(issue.subject, options.description));

  const createMr = options.mr ?? isAutoMrEnabled(config);
  const push = options.push === true || options.mr === true;

  if (push) {
    await pushAndCreateMergeRequest(
      config,
      {
        sourceBranch: currentBranch,
        targetBranch: options.targetBranch,
        baseBranch: workBranch.protectedBase || options.baseBranch,
        title: issue.subject,
        description: options.description || issue.subject,
        jiraKey: issue.key,
        jiraUrl: jiraService.browseUrl(issue.key),
      },
      { createMr, push }
    );
  } else {
    printInfo('Commit was not pushed to remote. Pass --push to push.');
    if (createMr) {
      printInfo('Merge request not created because the branch was not pushed. Pass --push or --mr.');
    }
  }

  printSuccess('Committed successfully!');
}
