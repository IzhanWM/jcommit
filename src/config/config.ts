import fs from 'fs';
import os from 'os';
import path from 'path';
import { GjCommitConfig } from '../types';

const CONFIG_ENV = 'JCOMMIT_CONFIG';
const DEFAULT_CONFIG_PATH = path.join(os.homedir(), '.jcommit.json');
const DEFAULT_PROTECTED_BRANCHES = ['master'];
const DEFAULT_PROTECTED_CACHE_TTL_HOURS = 24;

// Secrets may come from the environment instead of the config file, so they never
// have to be written to disk (or pasted into an AI chat).
const JIRA_TOKEN_ENVS = ['JCOMMIT_JIRA_API_TOKEN', 'JIRA_API_TOKEN'];
const GITLAB_TOKEN_ENVS = ['JCOMMIT_GITLAB_TOKEN', 'GITLAB_TOKEN'];

function firstEnv(names: string[]): string | undefined {
  for (const name of names) {
    if (process.env[name]) {
      return process.env[name];
    }
  }
  return undefined;
}

export function getConfigPath(explicitPath: string | null): string {
  if (explicitPath) {
    return path.resolve(explicitPath);
  }
  if (process.env[CONFIG_ENV]) {
    return path.resolve(process.env[CONFIG_ENV]);
  }
  return DEFAULT_CONFIG_PATH;
}

/** Reads the config file exactly as stored on disk (no environment overrides). */
export function readConfig(configPath: string): GjCommitConfig | null {
  if (!fs.existsSync(configPath)) {
    return null;
  }
  const raw = fs.readFileSync(configPath, 'utf8');
  return JSON.parse(raw) as GjCommitConfig;
}

/** Fills secrets that are missing from the file from environment variables. */
export function applyEnvOverrides(config: GjCommitConfig): GjCommitConfig {
  const jiraApiToken = config.jiraApiToken || firstEnv(JIRA_TOKEN_ENVS) || '';
  const gitlabToken = config.gitlab?.token || firstEnv(GITLAB_TOKEN_ENVS);
  return {
    ...config,
    jiraApiToken,
    gitlab: config.gitlab || gitlabToken ? { ...config.gitlab, token: gitlabToken } : undefined,
  };
}

export function writeConfig(configPath: string, data: GjCommitConfig): void {
  const payload = JSON.stringify(data, null, 2);
  fs.writeFileSync(configPath, `${payload}\n`, { mode: 0o600 });
  try {
    fs.chmodSync(configPath, 0o600);
  } catch (error) {
    // Ignore chmod failures on systems that do not support it.
  }
}

/**
 * Applies `mutate` to the config currently on disk and writes it back. Used for
 * state jcommit manages itself (e.g. the protected-branch cache) so values taken
 * from the environment are never persisted.
 */
export function updateStoredConfig(configPath: string, mutate: (config: GjCommitConfig) => void): void {
  const stored = readConfig(configPath);
  if (!stored) {
    return;
  }
  mutate(stored);
  writeConfig(configPath, stored);
}

export function ensureRequiredConfig(config: GjCommitConfig): string[] {
  const requiredFields = [
    'jiraDomain',
    'jiraEmail',
    'jiraApiToken',
    'jiraProjectId',
    'jiraIssueTypeId',
  ];
  const missing = requiredFields.filter((field) => !config[field as keyof GjCommitConfig]);
  return missing;
}

export function getDefaultProtectedBranches(): string[] {
  return DEFAULT_PROTECTED_BRANCHES;
}

export function getProtectedCacheTtlHours(config: GjCommitConfig): number {
  const ttl = config.protectedBranchCacheTtlHours;
  return typeof ttl === 'number' && ttl >= 0 ? ttl : DEFAULT_PROTECTED_CACHE_TTL_HOURS;
}
