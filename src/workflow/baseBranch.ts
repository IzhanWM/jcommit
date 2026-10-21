import { printError, printInfo, printSuccess } from '../utils/colors';
import { BaseBranchStatus, createBranchFromBase, locateBaseBranch, pushBranch, switchBranch } from '../utils/git';

/** How to proceed when the base branch exists locally but not on origin. */
export type LocalBaseChoice = 'local' | 'push' | 'cancel';

export function describeLocalOnlyBase(baseBranch: string, status: Extract<BaseBranchStatus, { location: 'local-only' }>): string {
  return status.reason === 'not-on-remote'
    ? `Base branch '${baseBranch}' exists only locally; it is not on origin.`
    : `Could not fetch '${baseBranch}' from origin (${status.detail.split('\n')[0] || 'fetch failed'}); a local '${baseBranch}' exists.`;
}

/**
 * Creates `newBranch` from `baseBranch` and switches to it. Uses `origin/<base>`
 * when the remote has it. When only a local base exists, `chooseLocalBase`
 * decides: branch from the local copy, push it to origin first, or cancel.
 * Exits the process on failure or cancel.
 */
export async function createBranchFromBaseInteractive(
  baseBranch: string,
  newBranch: string,
  chooseLocalBase: (message: string) => Promise<LocalBaseChoice>
): Promise<void> {
  const status = locateBaseBranch(baseBranch);
  let source: 'remote' | 'local' = 'remote';

  if (status.location === 'missing') {
    printError(`Base branch '${baseBranch}' was not found locally or on origin.`);
    if (status.detail) {
      printError(status.detail);
    }
    process.exit(1);
  }

  if (status.location === 'local-only') {
    const choice = await chooseLocalBase(describeLocalOnlyBase(baseBranch, status));
    if (choice === 'cancel') {
      printInfo('Cancelled. No branch was created.');
      process.exit(1);
    }
    if (choice === 'push') {
      printInfo(`Pushing '${baseBranch}' to origin...`);
      if (!pushBranch(baseBranch)) {
        printError(`Failed to push '${baseBranch}' to origin.`);
        process.exit(1);
      }
    } else {
      source = 'local';
    }
  }

  if (!createBranchFromBase(baseBranch, newBranch, source)) {
    printError(`Failed to create branch '${newBranch}' from '${baseBranch}'`);
    process.exit(1);
  }
  if (!switchBranch(newBranch)) {
    printError(`Failed to switch to newly created branch '${newBranch}'`);
    process.exit(1);
  }
  const from = source === 'local' ? `local '${baseBranch}'` : `origin/${baseBranch}`;
  printSuccess(`Created and switched to branch '${newBranch}' from ${from}`);
}
