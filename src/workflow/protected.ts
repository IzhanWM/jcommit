import { GjCommitConfig, ProtectedBranchCacheEntry } from '../types';
import { printError, printInfo, printSuccess, printWarning } from '../utils/colors';
import {
  createAndSwitchBranch,
  getRemoteDefaultBranch,
  getRemoteUrl,
  getRepoRoot,
  localBranchExists,
  remoteBranchExists,
  runGit,
} from '../utils/git';
import { GitLabService, parseRemoteUrl, RemoteInfo } from '../services/gitlab';
import { getDefaultProtectedBranches, getProtectedCacheTtlHours, updateStoredConfig } from '../config/config';

export interface RepoContext {
  /** Cache key: `<host>/<project path>`, or `local:<repo root>` when there is no origin remote. */
  key: string;
  remote: RemoteInfo | null;
}

export interface ProtectedBranches {
  /** Static list from the config (`protectedBranches`, default `master`). */
  configured: string[];
  /** Detected for this repository and stored in the config cache. */
  detected: string[];
  source: ProtectedBranchCacheEntry['source'] | null;
  fetchedAt: string | null;
  all: string[];
}

export function getRepoContext(): RepoContext {
  const remote = parseRemoteUrl(getRemoteUrl());
  if (remote) {
    return { key: `${remote.host}/${remote.projectPath}`, remote };
  }
  return { key: `local:${getRepoRoot()}`, remote: null };
}

export function getGitLabBaseUrl(config: GjCommitConfig, remote: RemoteInfo | null): string {
  if (config.gitlab?.url) {
    return config.gitlab.url;
  }
  return remote ? `https://${remote.host}` : '';
}

/**
 * GitLab project path for the API. If `gitlab.url` is served under a sub-path
 * (e.g. https://host/gitlab) and the remote path repeats it, strip it.
 */
export function getGitLabProjectPath(config: GjCommitConfig, remote: RemoteInfo): string {
  if (!config.gitlab?.url) {
    return remote.projectPath;
  }
  try {
    const prefix = new URL(config.gitlab.url).pathname.replace(/^\/+|\/+$/g, '');
    if (prefix && remote.projectPath.startsWith(`${prefix}/`)) {
      return remote.projectPath.slice(prefix.length + 1);
    }
  } catch {
    // Invalid URL: fall through and use the remote path as-is.
  }
  return remote.projectPath;
}

export function createGitLabService(config: GjCommitConfig, remote: RemoteInfo | null): GitLabService | null {
  const baseUrl = getGitLabBaseUrl(config, remote);
  const token = config.gitlab?.token;
  if (!baseUrl || !token) {
    return null;
  }
  return new GitLabService(baseUrl, token);
}

function isCacheFresh(entry: ProtectedBranchCacheEntry | undefined, ttlHours: number): boolean {
  if (!entry) {
    return false;
  }
  const age = Date.now() - new Date(entry.fetchedAt).getTime();
  return Number.isFinite(age) && age < ttlHours * 60 * 60 * 1000;
}

async function detectProtectedBranches(
  config: GjCommitConfig,
  repo: RepoContext
): Promise<ProtectedBranchCacheEntry | null> {
  const fetchedAt = new Date().toISOString();

  const gitlab = repo.remote ? createGitLabService(config, repo.remote) : null;
  if (gitlab && repo.remote) {
    try {
      const branches = await gitlab.getProtectedBranches(getGitLabProjectPath(config, repo.remote));
      return { branches, source: 'gitlab', fetchedAt };
    } catch (error) {
      printWarning(`Could not read protected branches from GitLab: ${(error as Error).message}`);
    }
  }

  // Without GitLab access, the remote's default branch is the one branch we can be
  // sure is protected.
  if (repo.remote) {
    const defaultBranch = getRemoteDefaultBranch();
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
export async function loadProtectedBranches(
  config: GjCommitConfig,
  configPath: string,
  options: { refresh?: boolean } = {}
): Promise<ProtectedBranches> {
  const configured =
    Array.isArray(config.protectedBranches) && config.protectedBranches.length
      ? config.protectedBranches
      : getDefaultProtectedBranches();

  const repo = getRepoContext();
  let entry = config.protectedBranchCache?.[repo.key];

  if (options.refresh || !isCacheFresh(entry, getProtectedCacheTtlHours(config))) {
    const detected = await detectProtectedBranches(config, repo);
    if (detected) {
      entry = detected;
      config.protectedBranchCache = { ...config.protectedBranchCache, [repo.key]: detected };
      try {
        updateStoredConfig(configPath, (stored) => {
          stored.protectedBranchCache = { ...stored.protectedBranchCache, [repo.key]: detected };
        });
      } catch (error) {
        printWarning(`Could not store protected branches in ${configPath}: ${(error as Error).message}`);
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
export function matchesBranchPattern(branch: string, pattern: string): boolean {
  if (!pattern.includes('*')) {
    return branch === pattern;
  }
  const regex = new RegExp(`^${pattern.split('*').map(escapeRegExp).join('.*')}$`);
  return regex.test(branch);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
}

export function isProtectedBranch(branch: string, protectedBranches: string[]): boolean {
  return protectedBranches.some((pattern) => matchesBranchPattern(branch, pattern));
}

function sanitizeRefSegment(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .replace(/\.{2,}/g, '.');
}

/** Prefix for auto-created branches: `branchPrefix`, else the Jira email's local part, else git user.name. */
export function getBranchPrefix(config: GjCommitConfig): string {
  const candidates = [
    config.branchPrefix,
    config.jiraEmail?.split('@')[0],
    runGit(['config', 'user.name']).stdout.trim(),
  ];
  for (const candidate of candidates) {
    const prefix = candidate ? sanitizeRefSegment(candidate) : '';
    if (prefix) {
      return prefix;
    }
  }
  return 'dev';
}

function nextFreeBranchName(baseName: string): string {
  let candidate = baseName;
  for (let suffix = 2; localBranchExists(candidate) || remoteBranchExists(candidate); suffix += 1) {
    candidate = `${baseName}-${suffix}`;
  }
  return candidate;
}

export interface WorkBranch {
  branch: string;
  /** The protected branch we moved away from — the natural merge request target. */
  protectedBase: string | null;
}

/**
 * Makes sure we never commit to a protected branch. When the current branch is
 * protected, a work branch `<prefix>/<branch>` is created from it (staged changes
 * carry over) unless `autoBranchOnProtected` is false, in which case we abort.
 */
export function ensureWorkBranch(
  currentBranch: string,
  config: GjCommitConfig,
  protectedBranches: string[]
): WorkBranch {
  if (!isProtectedBranch(currentBranch, protectedBranches)) {
    return { branch: currentBranch, protectedBase: null };
  }

  if (config.autoBranchOnProtected === false) {
    printError(`Operation cancelled. '${currentBranch}' is protected.`);
    process.exit(1);
  }

  const branch = nextFreeBranchName(`${getBranchPrefix(config)}/${currentBranch}`);
  printWarning(`'${currentBranch}' is protected — moving your work to a new branch '${branch}'.`);
  if (!createAndSwitchBranch(branch)) {
    printError(`Failed to create branch '${branch}' from protected branch '${currentBranch}'.`);
    process.exit(1);
  }
  printSuccess(`Created and switched to branch '${branch}' from '${currentBranch}'`);
  return { branch, protectedBase: currentBranch };
}

export function printProtectedBranches(result: ProtectedBranches, repoKey: string): void {
  printInfo(`Protected branches for ${repoKey}:`);
  console.log(`  configured: ${result.configured.join(', ') || '(none)'}`);
  const detectedLabel = result.source === 'gitlab' ? 'GitLab' : result.source === 'remote-default' ? 'remote default branch' : 'not detected';
  console.log(`  detected (${detectedLabel}): ${result.detected.join(', ') || '(none)'}`);
  if (result.fetchedAt) {
    console.log(`  last checked: ${result.fetchedAt}`);
  }
}
