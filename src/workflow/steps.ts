import { printError, printInfo, printSuccess, printWarning } from '../utils/colors';
import { runGit, getCurrentBranch } from '../utils/git';

/**
 * Shared, non-interactive workflow steps used by both the interactive and the
 * headless flows. Each step prints its own feedback and exits the process on a
 * fatal error, so callers can compose them top-to-bottom without re-checking.
 */

export function assertGitRepo(): void {
  const gitCheck = runGit(['rev-parse', '--git-dir']);
  if (gitCheck.status !== 0) {
    printError('Not in a git repository!');
    process.exit(1);
  }
}

export function requireCurrentBranch(): string {
  const currentBranch = getCurrentBranch();
  if (!currentBranch) {
    printError('Failed to get current branch');
    process.exit(1);
  }
  return currentBranch;
}

export function assertStagedChanges(): void {
  const diffResult = runGit(['diff', '--cached', '--quiet']);
  if (diffResult.status === 0) {
    printError('No staged changes found. Please stage your changes before committing.');
    process.exit(1);
  }
}

/**
 * Builds the full commit message: the `KEY | title` subject line, then the
 * structured description as the body (skipped when it only repeats the title).
 */
export function buildCommitMessage(subject: string, body?: string | null): string {
  const trimmedBody = (body || '').trim();
  const title = subject.replace(/^[A-Za-z]+-[0-9]+ \| /, '').trim();
  if (!trimmedBody || trimmedBody === title) {
    return subject;
  }
  return `${subject}\n\n${trimmedBody}`;
}

export function commitChanges(commitMessage: string): void {
  printInfo('Committing...');
  // Pass the message on stdin so multi-line markdown bodies survive intact;
  // `whitespace` cleanup keeps `## Heading` lines that `strip` would drop.
  const commitResult = runGit(['commit', '--cleanup=whitespace', '-F', '-'], {
    input: commitMessage,
    stdio: ['pipe', 'inherit', 'inherit'],
  });
  if (commitResult.status !== 0) {
    printError('Git commit failed');
    process.exit(1);
  }
  printSuccess(`Git commit successful with message: ${commitMessage.split('\n')[0]}`);
}

export function pushCurrentBranch(): void {
  const currentBranch = getCurrentBranch();
  printInfo('Pushing to remote...');
  const pushResult = runGit(['push', '--set-upstream', 'origin', currentBranch], {
    stdio: 'inherit',
  });
  if (pushResult.status !== 0) {
    printError('Git push failed');
    process.exit(1);
  }
  printSuccess('Git push successful');
}

const DESCRIPTION_MAX_LINES = 15;
const DESCRIPTION_MAX_CHARS = 1200;

/**
 * Descriptions feed developer docs, so they should stay short. Long ones are
 * allowed but flagged (a warning, not an error, so commits are never blocked).
 */
export function warnIfLongDescription(description: string | null): void {
  if (!description) {
    return;
  }
  const lines = description.trim().split('\n').length;
  const chars = description.trim().length;
  if (lines > DESCRIPTION_MAX_LINES || chars > DESCRIPTION_MAX_CHARS) {
    printWarning(
      `Description is long (${lines} lines, ${chars} chars; aim for ≤ ${DESCRIPTION_MAX_LINES} lines / ` +
        `${DESCRIPTION_MAX_CHARS} chars). Keep only developer-visible facts, or split the commit.`
    );
  }
}
