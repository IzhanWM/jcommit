import { GjCommitConfig } from '../types';
import { printError, printInfo, printSuccess } from '../utils/colors';
import { readConfig, writeConfig } from '../config/config';

type ValueKind = 'string' | 'secret' | 'boolean' | 'number' | 'string[]' | 'number[]';

// Keys `jcommit config` may edit. The protected-branch cache is managed by jcommit itself.
const CONFIG_KEYS: Record<string, ValueKind> = {
  jiraDomain: 'string',
  jiraEmail: 'string',
  jiraApiToken: 'secret',
  jiraAssigneeId: 'string',
  jiraProjectId: 'string',
  jiraIssueTypeId: 'string',
  protectedBranches: 'string[]',
  branchPrefix: 'string',
  autoBranchOnProtected: 'boolean',
  protectedBranchCacheTtlHours: 'number',
  'gitlab.url': 'string',
  'gitlab.token': 'secret',
  'gitlab.autoCreateMr': 'boolean',
  'gitlab.defaultTargetBranch': 'string',
  'gitlab.removeSourceBranch': 'boolean',
  'gitlab.squash': 'boolean',
  'gitlab.draft': 'boolean',
  'gitlab.labels': 'string[]',
  'gitlab.assigneeIds': 'number[]',
  'gitlab.reviewerIds': 'number[]',
};

function parseValue(key: string, kind: ValueKind, raw: string): unknown {
  switch (kind) {
    case 'boolean':
      if (/^(true|yes|on|1)$/i.test(raw)) return true;
      if (/^(false|no|off|0)$/i.test(raw)) return false;
      throw new Error(`'${key}' expects true or false.`);
    case 'number': {
      const value = Number(raw);
      if (!Number.isFinite(value)) throw new Error(`'${key}' expects a number.`);
      return value;
    }
    case 'string[]':
      return raw.split(',').map((item) => item.trim()).filter(Boolean);
    case 'number[]':
      return raw.split(',').map((item) => item.trim()).filter(Boolean).map((item) => {
        const value = Number(item);
        if (!Number.isInteger(value)) throw new Error(`'${key}' expects comma-separated numeric IDs.`);
        return value;
      });
    default:
      return raw;
  }
}

function getPath(config: Record<string, any>, key: string): unknown {
  return key.split('.').reduce<any>((node, part) => (node == null ? undefined : node[part]), config);
}

function setPath(config: Record<string, any>, key: string, value: unknown): void {
  const parts = key.split('.');
  const last = parts.pop() as string;
  let node = config;
  for (const part of parts) {
    if (typeof node[part] !== 'object' || node[part] === null) {
      node[part] = {};
    }
    node = node[part];
  }
  if (value === undefined) {
    delete node[last];
  } else {
    node[last] = value;
  }
}

function mask(value: unknown): string {
  const text = String(value ?? '');
  return text ? `${text.slice(0, 4)}…(${text.length} chars)` : '';
}

function formatValue(kind: ValueKind, value: unknown): string {
  if (value === undefined) return '(not set)';
  if (kind === 'secret') return mask(value);
  return Array.isArray(value) ? value.join(',') : String(value);
}

function requireKey(key: string | undefined): [string, ValueKind] {
  if (!key || !CONFIG_KEYS[key]) {
    printError(`Unknown config key: '${key ?? ''}'. Valid keys:\n  ${Object.keys(CONFIG_KEYS).join('\n  ')}`);
    process.exit(1);
  }
  return [key, CONFIG_KEYS[key]];
}

export function runConfigCommand(configPath: string, args: string[]): void {
  const [action = 'list', key, ...rest] = args;
  const stored = (readConfig(configPath) || {}) as GjCommitConfig & Record<string, any>;

  switch (action) {
    case 'path':
      console.log(configPath);
      return;
    case 'list':
      printInfo(`Config: ${configPath}`);
      Object.entries(CONFIG_KEYS).forEach(([name, kind]) => {
        console.log(`  ${name} = ${formatValue(kind, getPath(stored, name))}`);
      });
      return;
    case 'get': {
      const [name, kind] = requireKey(key);
      console.log(formatValue(kind, getPath(stored, name)));
      return;
    }
    case 'set': {
      const [name, kind] = requireKey(key);
      if (!rest.length) {
        printError(`Usage: jcommit config set ${name} <value>`);
        process.exit(1);
      }
      try {
        setPath(stored, name, parseValue(name, kind, rest.join(' ')));
      } catch (error) {
        printError((error as Error).message);
        process.exit(1);
      }
      writeConfig(configPath, stored);
      printSuccess(`Set ${name} = ${formatValue(kind, getPath(stored, name))}`);
      return;
    }
    case 'unset': {
      const [name] = requireKey(key);
      setPath(stored, name, undefined);
      writeConfig(configPath, stored);
      printSuccess(`Unset ${name}`);
      return;
    }
    default:
      printError(`Unknown config action '${action}'. Use: list | get <key> | set <key> <value> | unset <key> | path`);
      process.exit(1);
  }
}
