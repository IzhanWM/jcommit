#!/usr/bin/env node

import fs from 'fs';
import { checkForUpdates, parseArgs, showUsage, showVersion } from './cli/args';
import { runConfigCommand } from './cli/configCommand';
import { getConfigPath, readConfig, ensureRequiredConfig, applyEnvOverrides } from './config/config';
import { runSetup, mainWorkflow } from './workflow/main';
import { runHeadless } from './workflow/headless';
import { assertGitRepo, requireCurrentBranch, warnIfLongDescription } from './workflow/steps';
import { getRepoContext, loadProtectedBranches, printProtectedBranches } from './workflow/protected';
import { pushAndCreateMergeRequest } from './workflow/mergeRequest';
import { getLastCommitMessage } from './utils/git';
import { GjCommitConfig, ParsedArgs } from './types';
import { printError, printInfo, printWarning } from './utils/colors';

function resolveDescription(parsed: ParsedArgs): string | null {
  if (parsed.description && parsed.descriptionFile) {
    printError('Use either --description or --description-file, not both.');
    process.exit(1);
  }
  if (!parsed.descriptionFile) {
    return parsed.description;
  }
  try {
    const source = parsed.descriptionFile === '-' ? 0 : parsed.descriptionFile;
    return fs.readFileSync(source, 'utf8').trim() || null;
  } catch (error) {
    printError(`Could not read description file '${parsed.descriptionFile}': ${(error as Error).message}`);
    process.exit(1);
  }
}

async function runProtectedCommand(config: GjCommitConfig, configPath: string, refresh: boolean): Promise<void> {
  assertGitRepo();
  const result = await loadProtectedBranches(config, configPath, { refresh });
  printProtectedBranches(result, getRepoContext().key);
}

async function runMrCommand(config: GjCommitConfig, parsed: ParsedArgs): Promise<void> {
  assertGitRepo();
  const branch = requireCurrentBranch();
  const { subject, body } = getLastCommitMessage();
  const description = resolveDescription(parsed) || body || subject;
  warnIfLongDescription(description);
  const jiraKey = subject.match(/^([A-Za-z]+-[0-9]+) \| /)?.[1] || null;
  await pushAndCreateMergeRequest(
    config,
    {
      sourceBranch: branch,
      targetBranch: parsed.targetBranch,
      title: subject,
      description,
      jiraKey,
      jiraUrl: jiraKey && config.jiraDomain ? `https://${config.jiraDomain}/browse/${jiraKey}` : null,
    },
    { createMr: true, push: parsed.push === true }
  );
}

async function run(): Promise<void> {

  const parsed = parseArgs(process.argv.slice(2));
  if (parsed.help) {
    showUsage();
    return;
  }
  if (parsed.version) {
    await showVersion();
    return;
  }

  const isUtilityCommand = parsed.command === 'config' || parsed.command === 'protected' || parsed.command === 'mr';

  // Keep headless output clean and fast — skip the banner and the network update check.
  if (!parsed.headless && !isUtilityCommand) {
    printInfo('~ jcommit ~');
    await checkForUpdates();
    console.log('');
  }

  const configPath = getConfigPath(parsed.configPath);
  if (parsed.command === 'setup') {
    await runSetup(configPath);
    return;
  }
  if (parsed.command === 'config') {
    runConfigCommand(configPath, parsed.commandArgs);
    return;
  }

  const storedConfig = readConfig(configPath);
  if (!storedConfig) {
    printWarning(`Config not found at ${configPath}`);
    printInfo('It looks like this is your first time using jcommit. To get started, please run: jcommit setup');
    process.exit(1);
  }
  const config = applyEnvOverrides(storedConfig);

  if (parsed.command === 'protected') {
    await runProtectedCommand(config, configPath, parsed.refreshProtected);
    return;
  }
  if (parsed.command === 'mr') {
    await runMrCommand(config, parsed);
    return;
  }

  const missing = ensureRequiredConfig(config);
  if (missing.length) {
    printError('Your configuration is incomplete or outdated.');
    printInfo(`The following fields are required: ${missing.join(', ')}`);
    printInfo('Please update your settings by running: jcommit setup');
    process.exit(1);
  }

  if (parsed.headless) {
    await runHeadless(config, configPath, {
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

  await mainWorkflow(config, configPath);
}

run().catch((error) => {
  printError('Execution halted due to an unexpected error:');
  printError(error.message || String(error));
  process.exit(1);
});
