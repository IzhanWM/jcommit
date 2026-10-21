#!/usr/bin/env node
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const args_1 = require("./cli/args");
const configCommand_1 = require("./cli/configCommand");
const config_1 = require("./config/config");
const main_1 = require("./workflow/main");
const headless_1 = require("./workflow/headless");
const steps_1 = require("./workflow/steps");
const protected_1 = require("./workflow/protected");
const mergeRequest_1 = require("./workflow/mergeRequest");
const git_1 = require("./utils/git");
const jira_1 = require("./services/jira");
const colors_1 = require("./utils/colors");
function resolveDescription(parsed) {
    if (parsed.description && parsed.descriptionFile) {
        (0, colors_1.printError)('Use either --description or --description-file, not both.');
        process.exit(1);
    }
    if (!parsed.descriptionFile) {
        return parsed.description;
    }
    try {
        const source = parsed.descriptionFile === '-' ? 0 : parsed.descriptionFile;
        return fs_1.default.readFileSync(source, 'utf8').trim() || null;
    }
    catch (error) {
        (0, colors_1.printError)(`Could not read description file '${parsed.descriptionFile}': ${error.message}`);
        process.exit(1);
    }
}
async function runProtectedCommand(config, configPath, refresh) {
    (0, steps_1.assertGitRepo)();
    const result = await (0, protected_1.loadProtectedBranches)(config, configPath, { refresh });
    (0, protected_1.printProtectedBranches)(result, (0, protected_1.getRepoContext)().key);
}
async function runMrCommand(config, parsed) {
    (0, steps_1.assertGitRepo)();
    const branch = (0, steps_1.requireCurrentBranch)();
    const { subject, body } = (0, git_1.getLastCommitMessage)();
    const description = resolveDescription(parsed) || body || subject;
    (0, steps_1.warnIfLongDescription)(description);
    const jiraKey = subject.match(/^([A-Za-z]+-[0-9]+) \| /)?.[1] || null;
    await (0, mergeRequest_1.pushAndCreateMergeRequest)(config, {
        sourceBranch: branch,
        targetBranch: parsed.targetBranch,
        title: subject,
        description,
        jiraKey,
        jiraUrl: jiraKey && config.jiraDomain ? `https://${config.jiraDomain}/browse/${jiraKey}` : null,
    }, { createMr: true, push: parsed.push === true });
}
async function runIssuesCommand(config, parsed) {
    const missing = ['jiraDomain', 'jiraEmail', 'jiraApiToken'].filter((field) => !config[field]);
    if (missing.length) {
        (0, colors_1.printError)(`Listing Jira issues needs: ${missing.join(', ')}. Run: jcommit setup`);
        process.exit(1);
    }
    const jira = new jira_1.JiraService(config);
    const issues = await jira.getOpenIssues(config.jiraAssigneeId, parsed.limit ?? 50);
    const rows = issues.map((issue) => ({ ...issue, key: issue.id, url: jira.browseUrl(issue.id) }));
    if (parsed.json) {
        console.log(JSON.stringify(rows.map(({ key, summary, status, priority, type, url }) => ({
            key, summary, status, priority, type, url,
        })), null, 2));
        return;
    }
    if (!rows.length) {
        (0, colors_1.printInfo)('No open Jira issues are assigned to you.');
        return;
    }
    const who = config.jiraAssigneeId ? `account ${config.jiraAssigneeId}` : 'you';
    (0, colors_1.printInfo)(`Open Jira issues assigned to ${who} (${rows.length}), most recently updated first:`);
    const keyWidth = Math.max(...rows.map((row) => row.key.length));
    const statusWidth = Math.max(...rows.map((row) => row.status.length));
    rows.forEach((row) => {
        const meta = [row.type, row.priority].filter(Boolean).join(', ');
        console.log(`  ${row.key.padEnd(keyWidth)}  ${row.status.padEnd(statusWidth)}  ${row.summary}${meta ? `  (${meta})` : ''}`);
    });
    console.log('');
    (0, colors_1.printInfo)('Commit against one with: jcommit -t <KEY> ...');
}
async function run() {
    const parsed = (0, args_1.parseArgs)(process.argv.slice(2));
    if (parsed.help) {
        (0, args_1.showUsage)();
        return;
    }
    if (parsed.version) {
        await (0, args_1.showVersion)();
        return;
    }
    const isUtilityCommand = ['config', 'protected', 'mr', 'issues'].includes(parsed.command ?? '');
    // Keep headless output clean and fast — skip the banner and the network update check.
    if (!parsed.headless && !isUtilityCommand) {
        (0, colors_1.printInfo)('~ jcommit ~');
        await (0, args_1.checkForUpdates)();
        console.log('');
    }
    const configPath = (0, config_1.getConfigPath)(parsed.configPath);
    if (parsed.command === 'setup') {
        await (0, main_1.runSetup)(configPath);
        return;
    }
    if (parsed.command === 'config') {
        (0, configCommand_1.runConfigCommand)(configPath, parsed.commandArgs);
        return;
    }
    const storedConfig = (0, config_1.readConfig)(configPath);
    if (!storedConfig) {
        (0, colors_1.printWarning)(`Config not found at ${configPath}`);
        (0, colors_1.printInfo)('It looks like this is your first time using jcommit. To get started, please run: jcommit setup');
        process.exit(1);
    }
    const config = (0, config_1.applyEnvOverrides)(storedConfig);
    if (parsed.command === 'protected') {
        await runProtectedCommand(config, configPath, parsed.refreshProtected);
        return;
    }
    if (parsed.command === 'mr') {
        await runMrCommand(config, parsed);
        return;
    }
    if (parsed.command === 'issues') {
        await runIssuesCommand(config, parsed);
        return;
    }
    const missing = (0, config_1.ensureRequiredConfig)(config);
    if (missing.length) {
        (0, colors_1.printError)('Your configuration is incomplete or outdated.');
        (0, colors_1.printInfo)(`The following fields are required: ${missing.join(', ')}`);
        (0, colors_1.printInfo)('Please update your settings by running: jcommit setup');
        process.exit(1);
    }
    if (parsed.headless) {
        await (0, headless_1.runHeadless)(config, configPath, {
            message: parsed.message,
            ticket: parsed.ticket,
            description: resolveDescription(parsed),
            switchBranch: parsed.switchBranch,
            createBranch: parsed.createBranch,
            baseBranch: parsed.baseBranch,
            push: parsed.push,
            mr: parsed.mr,
            targetBranch: parsed.targetBranch,
            refreshProtected: parsed.refreshProtected,
        });
        return;
    }
    await (0, main_1.mainWorkflow)(config, configPath);
}
run().catch((error) => {
    (0, colors_1.printError)('Execution halted due to an unexpected error:');
    (0, colors_1.printError)(error.message || String(error));
    process.exit(1);
});
//# sourceMappingURL=index.js.map