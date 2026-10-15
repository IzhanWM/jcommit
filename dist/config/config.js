"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getConfigPath = getConfigPath;
exports.readConfig = readConfig;
exports.applyEnvOverrides = applyEnvOverrides;
exports.writeConfig = writeConfig;
exports.updateStoredConfig = updateStoredConfig;
exports.ensureRequiredConfig = ensureRequiredConfig;
exports.getDefaultProtectedBranches = getDefaultProtectedBranches;
exports.getProtectedCacheTtlHours = getProtectedCacheTtlHours;
const fs_1 = __importDefault(require("fs"));
const os_1 = __importDefault(require("os"));
const path_1 = __importDefault(require("path"));
const CONFIG_ENV = 'JCOMMIT_CONFIG';
const DEFAULT_CONFIG_PATH = path_1.default.join(os_1.default.homedir(), '.jcommit.json');
const DEFAULT_PROTECTED_BRANCHES = ['master'];
const DEFAULT_PROTECTED_CACHE_TTL_HOURS = 24;
// Secrets may come from the environment instead of the config file, so they never
// have to be written to disk (or pasted into an AI chat).
const JIRA_TOKEN_ENVS = ['JCOMMIT_JIRA_API_TOKEN', 'JIRA_API_TOKEN'];
const GITLAB_TOKEN_ENVS = ['JCOMMIT_GITLAB_TOKEN', 'GITLAB_TOKEN'];
function firstEnv(names) {
    for (const name of names) {
        if (process.env[name]) {
            return process.env[name];
        }
    }
    return undefined;
}
function getConfigPath(explicitPath) {
    if (explicitPath) {
        return path_1.default.resolve(explicitPath);
    }
    if (process.env[CONFIG_ENV]) {
        return path_1.default.resolve(process.env[CONFIG_ENV]);
    }
    return DEFAULT_CONFIG_PATH;
}
/** Reads the config file exactly as stored on disk (no environment overrides). */
function readConfig(configPath) {
    if (!fs_1.default.existsSync(configPath)) {
        return null;
    }
    const raw = fs_1.default.readFileSync(configPath, 'utf8');
    return JSON.parse(raw);
}
/** Fills secrets that are missing from the file from environment variables. */
function applyEnvOverrides(config) {
    const jiraApiToken = config.jiraApiToken || firstEnv(JIRA_TOKEN_ENVS) || '';
    const gitlabToken = config.gitlab?.token || firstEnv(GITLAB_TOKEN_ENVS);
    return {
        ...config,
        jiraApiToken,
        gitlab: config.gitlab || gitlabToken ? { ...config.gitlab, token: gitlabToken } : undefined,
    };
}
function writeConfig(configPath, data) {
    const payload = JSON.stringify(data, null, 2);
    fs_1.default.writeFileSync(configPath, `${payload}\n`, { mode: 0o600 });
    try {
        fs_1.default.chmodSync(configPath, 0o600);
    }
    catch (error) {
        // Ignore chmod failures on systems that do not support it.
    }
}
/**
 * Applies `mutate` to the config currently on disk and writes it back. Used for
 * state jcommit manages itself (e.g. the protected-branch cache) so values taken
 * from the environment are never persisted.
 */
function updateStoredConfig(configPath, mutate) {
    const stored = readConfig(configPath);
    if (!stored) {
        return;
    }
    mutate(stored);
    writeConfig(configPath, stored);
}
function ensureRequiredConfig(config) {
    const requiredFields = [
        'jiraDomain',
        'jiraEmail',
        'jiraApiToken',
        'jiraProjectId',
        'jiraIssueTypeId',
    ];
    const missing = requiredFields.filter((field) => !config[field]);
    return missing;
}
function getDefaultProtectedBranches() {
    return DEFAULT_PROTECTED_BRANCHES;
}
function getProtectedCacheTtlHours(config) {
    const ttl = config.protectedBranchCacheTtlHours;
    return typeof ttl === 'number' && ttl >= 0 ? ttl : DEFAULT_PROTECTED_CACHE_TTL_HOURS;
}
//# sourceMappingURL=config.js.map