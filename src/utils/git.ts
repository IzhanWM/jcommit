import { spawnSync, SpawnSyncOptions } from 'child_process';

interface GitResult {
  status: number;
  stdout: string;
  stderr: string;
  error?: Error;
}

function runCommand(command: string, args: string[], options: SpawnSyncOptions = {}): GitResult {
  const result = spawnSync(command, args, { encoding: 'utf8', ...options });
  if (result.error) {
    throw result.error;
  }
  return {
    status: result.status || 0,
    stdout: (result.stdout as string) || '',
    stderr: (result.stderr as string) || '',
  };
}

export function runGit(args: string[], options: SpawnSyncOptions = {}): GitResult {
  return runCommand('git', args, options);
}

export function listLocalBranches(): string[] {
  const result = runGit(['branch']);
  if (result.status !== 0) {
    throw new Error(result.stderr || 'Failed to list branches.');
  }
  return result.stdout
    .split('\n')
    .map((line) => line.replace(/^[* ]\s?/, '').trim())
    .filter(Boolean);
}

export function listRemoteBranches(): string[] {
  const result = runGit(['branch', '-r']);
  if (result.status !== 0) {
    throw new Error(result.stderr || 'Failed to list remote branches.');
  }
  const branches = result.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('origin/') && !line.includes('HEAD'))
    .map((line) => line.replace(/^origin\//, ''));
  return [...new Set(branches)].sort();
}

export function getCurrentBranch(): string {
  const result = runGit(['rev-parse', '--abbrev-ref', 'HEAD']);
  if (result.status !== 0) {
    return '';
  }
  return result.stdout.trim();
}

export function switchBranch(branchName: string): boolean {
  const result = runGit(['checkout', branchName], { stdio: 'inherit' });
  return result.status === 0;
}

export type BaseBranchStatus =
  | { location: 'remote' }
  | { location: 'local-only'; reason: 'not-on-remote' | 'fetch-failed'; detail: string }
  | { location: 'missing'; detail: string };

/**
 * Where a base branch can be taken from. Fetches `origin/<base>` first; when the
 * remote doesn't have it (or can't be reached) but a local branch exists, the
 * caller has to decide how to proceed instead of silently using a local copy.
 */
export function locateBaseBranch(baseBranch: string): BaseBranchStatus {
  const fetchResult = runGit(['fetch', 'origin', baseBranch]);
  if (fetchResult.status === 0 && remoteBranchExists(baseBranch)) {
    return { location: 'remote' };
  }
  const notOnRemote = /couldn't find remote ref|not our ref|no such ref/i.test(fetchResult.stderr);
  const detail = fetchResult.stderr.trim();
  if (localBranchExists(baseBranch)) {
    return { location: 'local-only', reason: notOnRemote ? 'not-on-remote' : 'fetch-failed', detail };
  }
  return { location: 'missing', detail };
}

/** Creates `newBranch` from `origin/<base>` (source `remote`) or the local `<base>` (source `local`). */
export function createBranchFromBase(baseBranch: string, newBranch: string, source: 'remote' | 'local'): boolean {
  const startPoint = source === 'remote' ? `origin/${baseBranch}` : baseBranch;
  return runGit(['branch', newBranch, startPoint], { stdio: 'inherit' }).status === 0;
}

export function pushBranch(branchName: string): boolean {
  return runGit(['push', '--set-upstream', 'origin', branchName], { stdio: 'inherit' }).status === 0;
}

export function getRemoteUrl(remote = 'origin'): string {
  const result = runGit(['remote', 'get-url', remote]);
  return result.status === 0 ? result.stdout.trim() : '';
}

export function getRepoRoot(): string {
  const result = runGit(['rev-parse', '--show-toplevel']);
  return result.status === 0 ? result.stdout.trim() : '';
}

export function localBranchExists(branchName: string): boolean {
  return runGit(['show-ref', '--verify', '--quiet', `refs/heads/${branchName}`]).status === 0;
}

export function remoteBranchExists(branchName: string, remote = 'origin'): boolean {
  return runGit(['show-ref', '--verify', '--quiet', `refs/remotes/${remote}/${branchName}`]).status === 0;
}

/** Creates `branchName` at the current HEAD and switches to it; staged changes carry over. */
export function createAndSwitchBranch(branchName: string): boolean {
  const result = runGit(['checkout', '-b', branchName], { stdio: 'inherit' });
  return result.status === 0;
}

/** The remote's default branch (e.g. `master`), from the local ref or by asking the remote. */
export function getRemoteDefaultBranch(remote = 'origin'): string {
  const local = runGit(['symbolic-ref', '--short', `refs/remotes/${remote}/HEAD`]);
  if (local.status === 0 && local.stdout.trim()) {
    return local.stdout.trim().replace(new RegExp(`^${remote}/`), '');
  }
  const remoteHead = runGit(['ls-remote', '--symref', remote, 'HEAD'], { timeout: 10000 });
  const match = remoteHead.stdout.match(/^ref:\s+refs\/heads\/(\S+)\s+HEAD/m);
  return match ? match[1] : '';
}

export function getLastCommitMessage(): { subject: string; body: string } {
  const subject = runGit(['log', '-1', '--format=%s']).stdout.trim();
  const body = runGit(['log', '-1', '--format=%b']).stdout.trim();
  return { subject, body };
}
