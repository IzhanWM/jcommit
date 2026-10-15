import https from 'https';
import packageJson from '../../package.json';
import { ParsedArgs } from '../types';
import { printInfo, printError, printWarning } from '../utils/colors';

export function parseArgs(argv: string[]): ParsedArgs {
  const args = [...argv];
  const parsed: ParsedArgs = {
    command: null,
    commandArgs: [],
    configPath: null,
    help: false,
    version: false,
    headless: false,
    message: null,
    ticket: null,
    description: null,
    switchBranch: null,
    createBranch: null,
    baseBranch: null,
    push: null,
    mr: null,
    targetBranch: null,
    refreshProtected: false,
    descriptionFile: null,
  };
  const validCommands = ['setup', 'config', 'protected', 'mr'];

  while (args.length) {
    const raw = args.shift();

    if (!raw) continue;

    // Support both "--flag value" and "--flag=value" forms.
    let current = raw;
    let inlineValue: string | undefined;
    if (raw.startsWith('--') && raw.includes('=')) {
      const eq = raw.indexOf('=');
      current = raw.slice(0, eq);
      inlineValue = raw.slice(eq + 1);
    }
    const takeValue = (): string | null => inlineValue ?? args.shift() ?? null;

    if (current === '-h' || current === '--help') {
      parsed.help = true;
    } else if (current === '-v' || current === '--version') {
      parsed.version = true;
    } else if (current === '-c' || current === '--config') {
      parsed.configPath = takeValue();
    } else if (current === '-y' || current === '--yes' || current === '--headless' || current === '--non-interactive') {
      parsed.headless = true;
    } else if (current === '-m' || current === '--message') {
      parsed.message = takeValue();
    } else if (current === '-t' || current === '--ticket') {
      parsed.ticket = takeValue();
    } else if (current === '-d' || current === '--description') {
      parsed.description = takeValue();
    } else if (current === '-F' || current === '--description-file') {
      parsed.descriptionFile = takeValue();
    } else if (current === '-b' || current === '--branch' || current === '--switch') {
      parsed.switchBranch = takeValue();
    } else if (current === '--create-branch' || current === '--create') {
      parsed.createBranch = takeValue();
    } else if (current === '--base' || current === '--from') {
      parsed.baseBranch = takeValue();
    } else if (current === '--push') {
      parsed.push = true;
    } else if (current === '--no-push') {
      parsed.push = false;
    } else if (current === '--mr') {
      parsed.mr = true;
    } else if (current === '--no-mr') {
      parsed.mr = false;
    } else if (current === '--target') {
      parsed.targetBranch = takeValue();
    } else if (current === '--refresh-protected' || current === '--refresh') {
      parsed.refreshProtected = true;
    } else if (current.startsWith('-')) {
      printError(`Unknown option: '${current}'`);
      parsed.help = true;
    } else if (!parsed.command) {
      // First bare token (no leading dash) is treated as the command.
      parsed.command = current;
    } else {
      parsed.commandArgs.push(current);
    }
  }

  // Check if the user entered an unrecognized command
  if (parsed.command && !validCommands.includes(parsed.command)) {
    printError(`Unknown command: '${parsed.command}'`);
    parsed.help = true; // Force help to show for guidance
  }

  // --message / --ticket have no meaning interactively, so they imply headless intent.
  if (parsed.message || parsed.ticket || parsed.descriptionFile) {
    parsed.headless = true;
  }

  return parsed;
}

export function showUsage(): void {
  console.log(`
┌─────────────────────────────────────────────────────────────────┐
│                     jcommit — Jira + Git CLI                    │
│                Seamlessly integrate Jira and Git                │
└─────────────────────────────────────────────────────────────────┘

Usage:
  jcommit

Commands:
  setup               Start the interactive setup wizard
                      (configure Jira, GitLab and branch rules)
  config <action>     Non-interactive config: list | get <key> | set <key> <value>
                      | unset <key> | path   (dotted keys, e.g. gitlab.autoCreateMr)
  protected           Show protected branches for this repo (--refresh re-detects)
  mr                  Create a GitLab merge request for the current pushed branch
                      (--target <branch>)
  (default)           Run the commit workflow

Options:
  -c, --config <path>  Use a custom configuration file path
  -h, --help           Show this help message
  -v, --version        Show current version and check for updates

Headless mode (no prompts — for CI, scripts, and git hooks):
  -y, --headless       Run the workflow without any interactive prompts
  -t, --ticket <KEY>   Use an existing Jira issue (e.g., PROJ-123)
  -m, --message <text> Create a new Jira issue with this summary, or set a
                       custom message when combined with --ticket
  -d, --description    Detailed description: commit body, Jira description (new
                       issues) and merge request description. Markdown allowed.
  -F, --description-file <path>
                       Read the description from a file ('-' for stdin)
  -b, --branch <name>  Switch to an existing branch before committing
  --create-branch <n>  Create a new branch (requires --base)
  --base <name>        Base branch for --create-branch
  --push               Push to remote after committing
  --no-push            Do not push (default in headless mode)
  --mr / --no-mr       Create a GitLab merge request (implies --push); defaults
                       to gitlab.autoCreateMr when the branch is pushed
  --target <branch>    Merge request target branch
  --refresh-protected  Re-detect protected branches from GitLab before committing

  Committing on a protected branch moves the work to <prefix>/<branch> first.

  Passing --ticket or --message turns on headless mode automatically.

Quick Start:
  1. Stage changes:    git add .
  2. Run jcommit:      jcommit

Headless examples:
  jcommit -t PROJ-123 --push                 Commit against an existing issue, then push
  jcommit -m "fix login redirect" --push     Create an issue from the message, commit, push
  jcommit -t PROJ-123 -m "custom message"    Existing issue with a custom commit message
  jcommit -m "add cache" --create-branch feat/cache --base main
  jcommit -t PROJ-123 -m "Add date range filter to Data Table" -F notes.md --mr

The tool will help you:
  • Create or switch branches
  • Fetch or Create Jira ticket
  • Avoid protected branches by moving work to <prefix>/<branch>
  • Commit, push and open a GitLab merge request seamlessly

Note: Run inside a Git-initialized repository.
`);
}

function compareVersions(leftVersion: string, rightVersion: string): number {
  const left = leftVersion.replace(/^v/, '').split('.').map((part) => Number.parseInt(part, 10) || 0);
  const right = rightVersion.replace(/^v/, '').split('.').map((part) => Number.parseInt(part, 10) || 0);
  const maxLength = Math.max(left.length, right.length);

  for (let index = 0; index < maxLength; index += 1) {
    const leftValue = left[index] ?? 0;
    const rightValue = right[index] ?? 0;
    if (leftValue !== rightValue) {
      return leftValue > rightValue ? 1 : -1;
    }
  }

  return 0;
}

function fetchLatestVersion(packageName: string): Promise<string | null> {
  return new Promise((resolve) => {
    const request = https.get(`https://registry.npmjs.org/${packageName}/latest`, (response) => {
      if (response.statusCode !== 200) {
        response.resume();
        resolve(null);
        return;
      }

      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => {
        body += chunk;
      });
      response.on('end', () => {
        try {
          const parsed = JSON.parse(body) as { version?: string };
          resolve(parsed.version ?? null);
        } catch {
          resolve(null);
        }
      });
    });

    request.on('error', () => resolve(null));
    request.setTimeout(3000, () => {
      request.destroy();
      resolve(null);
    });
  });
}

export async function checkForUpdates(): Promise<void> {
  const currentVersion = packageJson.version;
  const latestVersion = await fetchLatestVersion(packageJson.name);

  if (!latestVersion) {
    return;
  }

  if (compareVersions(latestVersion, currentVersion) > 0) {
    printWarning(
      `Update available: v${currentVersion} → v${latestVersion}. Run "npm i -g ${packageJson.name}" to update.`
    );
  }
}

export async function showVersion(): Promise<void> {
  printInfo(`jcommit v${packageJson.version}`);
  await checkForUpdates();
}
