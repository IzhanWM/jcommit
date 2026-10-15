# jcommit

jcommit turns "commit my changes" into a Jira-linked, documentation-ready commit,
and optionally pushes it and opens a GitLab merge request.

It ships as a **Claude Code plugin** (Claude reads the staged diff and writes
the commit title and a structured description) and as a standalone **CLI**.

- **Documentation-ready commits.** Every commit is `KEY | <title>` plus a
  short structured body (a *Summary*, optional *Details* and *Upgrade notes*,
  and `Doc-Impact` / `Doc-Area` trailers), written for WaveMaker app
  developers and sized by how much the change matters to docs. The same text becomes the Jira description and the MR
  description, so app developer docs and release notes can be built straight
  from history.
- **Jira integration.** Reference an existing work item or create one (with
  assignee).
- **Protected-branch safety.** jcommit detects protected branches from GitLab
  (wildcards like `release-*` included) and stores them per repository. When you
  commit on a protected branch, it moves your staged work to a new branch
  `<name>/<branch>` (for example `izhan.ali/release-11.0`) instead of failing.
- **GitLab merge requests.** If enabled, jcommit opens an MR after the push. The
  target is the protected branch you started from, or the project default, or
  whatever branch you pass. If an MR is already open for the branch, jcommit
  reuses it.
- **Remote sync.** It still creates branches from the latest remote base and
  pushes after committing.

## Claude Code plugin

### Install

From GitHub:

```
/plugin marketplace add IzhanWM/jcommit
/plugin install jcommit@jcommit
```

From a GitLab mirror (keep the `.git` suffix; private repos use your existing git
credentials):

```
/plugin marketplace add https://gitlab.wavemaker.com/<group>/jcommit.git
/plugin install jcommit@jcommit
```

Claude Code 2.1.275 or later can do it in one step:
`/plugin install jcommit --marketplace IzhanWM/jcommit`.

You need Node.js 18.16.1 or later. There's no build step, because the plugin
runs the bundled `dist/`.

### Configure

```
/jcommit:setup
```

Claude walks you through the settings (see [Configuration](#configuration)).
The GitLab token is optional: it adds protected-branch detection from GitLab
and full MR descriptions. Keep tokens out of the chat. Either export them in your shell profile and
restart Claude Code:

```sh
export JIRA_API_TOKEN=...   # https://id.atlassian.com/manage-profile/security/api-tokens
export GITLAB_TOKEN=...     # GitLab → Preferences → Access tokens, scope: api
```

Or run the full interactive wizard in your own terminal. `/jcommit:setup`
prints the exact command:

```sh
node <plugin-dir>/dist/index.js setup
```

### Use

| Command | What it does |
| --- | --- |
| `/jcommit:commit [KEY] [--push] [--mr]` | Reads the staged diff, drafts the title and documentation-ready description, shows them to you, then commits (and pushes and opens an MR if asked or configured). Claude also picks this up from plain requests like *"commit this against WMS-123 and raise an MR"*. |
| `/jcommit:mr [--target <branch>]` | Opens a GitLab MR for work that's already committed. |
| `/jcommit:setup` | Creates or changes the configuration. |

Claude confirms before anything outward-facing, such as creating a Jira issue,
pushing, or opening an MR.

## Commit format

```
WMS-1234 | Add date range filter to Data Table

## Summary
Date columns in the Data Table can be filtered by a from–to range, so you no longer need a custom header template.

## Details
- New column property `filterType`: `default` | `daterange` (date and datetime columns only). Default `default`.
- Not available in React Native apps yet.

Doc-Impact: major
Doc-Area: Widgets/Data Table
```

Descriptions are deliberately short. `## Summary` and the two trailers are
always there. `## Details` and `## Upgrade notes` appear only when they carry
developer-visible facts. Length follows `Doc-Impact`:

| Doc-Impact | Description |
| --- | --- |
| `none` (internal) | One Summary sentence and trailers |
| `minor` | Summary and up to 3 Details bullets |
| `major` | Summary, up to 5 Details bullets, and Upgrade notes if existing apps are affected |

No file lists, implementation narration or test boilerplate. The CLI warns
when a description passes 15 lines or 1,200 characters. Claude writes this
description on every commit by default, with no extra command. The full rules
are in [`skills/commit/references/description.md`](skills/commit/references/description.md). To mine history for docs:

```sh
git log --grep='^Doc-Impact: major' --format='%h %s'
git log --format='%(trailers:key=Doc-Area,valueonly)%x09%s'
```

## Protected branches

Protected branches come from two places:

1. **Configured:** `protectedBranches` in the config (default `["master"]`;
   wildcards such as `release-*` work).
2. **Detected:** read from the GitLab API (`/projects/:id/protected_branches`)
   and stored per repository under `protectedBranchCache` in the config. The
   list refreshes every `protectedBranchCacheTtlHours` (default 24), or on
   demand with `--refresh-protected` / `jcommit protected --refresh`. Without
   GitLab access, jcommit falls back to the remote's default branch.

When the current branch matches either list, jcommit runs
`git checkout -b <prefix>/<branch>` (your staged changes come along) and commits
there. If that branch already exists, it uses `-2`, `-3` and so on. The prefix is
`branchPrefix`, or the part of `jiraEmail` before the `@`. To abort instead, as
before, set `autoBranchOnProtected` to `false`.

## GitLab merge requests

To turn on automatic MRs, set `gitlab.autoCreateMr` to `true`. Every push then
opens an MR. Without it, `--mr` creates one for a single run.

| | |
| --- | --- |
| API URL | `gitlab.url`, or `https://<host of origin remote>` |
| Project | Path of the `origin` remote, e.g. `group/sub/project` |
| Token | Optional. `gitlab.token`, `$GITLAB_TOKEN` or `$JCOMMIT_GITLAB_TOKEN` (scope `api`). Without one, push options are used (see below) |
| Target branch | `--target`, then the protected branch you were moved off, then the `--base` of `--create-branch`, then `gitlab.defaultTargetBranch`, then the project default |
| Title / description | Commit subject / commit body, plus a link to the Jira issue |
| Options | `gitlab.removeSourceBranch` (default `true`), `gitlab.squash`, `gitlab.draft`, `gitlab.labels`, `gitlab.assigneeIds`, `gitlab.reviewerIds` |

**Without a GitLab token**, jcommit still opens the MR. It uses
[GitLab push options](https://docs.gitlab.com/user/project/push_options/) on
the push itself (`git push -o merge_request.create …`), which work with your
existing SSH or git credentials. Trade-offs compared with the API:

- Git doesn't allow line breaks in push options, so the MR description is the
  one-line Summary plus the Jira link. The full structured description stays in
  the commit.
- `gitlab.reviewerIds` and `gitlab.squash` can't be set. Title, target, labels,
  assignees, draft and remove-source-branch work.
- GitLab only reads push options when something new is pushed, so
  `jcommit mr` on an already-pushed branch needs a token.
- If the remote doesn't accept push options, jcommit pushes normally and
  reports that no MR was created.

An MR failure is reported with a non-zero exit code, but the commit and push
stay in place.

## Configuration

The config is stored at `~/.jcommit.json`. Override the location with
`JCOMMIT_CONFIG=/path` or `-c /path`. Edit it with the wizard (`jcommit setup`)
or non-interactively:

```sh
jcommit config list                     # secrets masked
jcommit config set gitlab.autoCreateMr true
jcommit config set protectedBranches master,release-*
jcommit config unset branchPrefix
jcommit config path
```

| Key | Required | Description |
| --- | --- | --- |
| `jiraDomain` | yes | e.g. `company.atlassian.net` |
| `jiraEmail` | yes | Your Jira email |
| `jiraApiToken` | yes* | [Jira API token](https://id.atlassian.com/manage-profile/security/api-tokens). *Or `$JIRA_API_TOKEN` / `$JCOMMIT_JIRA_API_TOKEN` |
| `jiraProjectId` | yes | [Jira project ID](https://support.atlassian.com/jira/kb/how-to-get-the-id-of-a-jira-project-from-a-web-browser/) |
| `jiraIssueTypeId` | yes | [Issue type ID](https://support.atlassian.com/jira/kb/finding-the-id-for-issue-types-in-jira-server-or-data-center/) |
| `jiraAssigneeId` | no | [Jira account ID](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-users#api-group-users) to assign new issues to |
| `protectedBranches` | no | Protected branch names or patterns (default `["master"]`) |
| `branchPrefix` | no | Prefix for `<prefix>/<branch>` (default: `jiraEmail` before `@`) |
| `autoBranchOnProtected` | no | `false` aborts on protected branches (default `true`) |
| `protectedBranchCacheTtlHours` | no | Hours before re-detecting (default `24`) |
| `gitlab.*` | no | See [GitLab merge requests](#gitlab-merge-requests) |

## CLI

You can also install the CLI without Claude:

```sh
npm install -g .        # from a clone
jcommit setup
jcommit                 # interactive workflow
```

### Headless mode (CI, scripts and git hooks)

Headless mode runs with no prompts. It turns on with `--headless`/`-y`, or
automatically with `--ticket`, `--message` or `--description-file`.

```sh
jcommit --ticket PROJ-123 --push                          # existing issue, then push
jcommit --message "Fix login redirect" --push             # create issue, commit, push
jcommit -t PROJ-123 -m "Add date range filter" -F notes.md --mr   # custom title + description + MR
jcommit -m "Add cache layer" --create-branch feat/cache --base main
```

| Flag | Description |
| --- | --- |
| `-y`, `--headless` | Run without prompts |
| `-t`, `--ticket <KEY>` | Use an existing Jira issue |
| `-m`, `--message <text>` | Title: new-issue summary, or custom title with `--ticket` (single line) |
| `-d`, `--description <text>` | Description: commit body, new Jira issue description, MR description |
| `-F`, `--description-file <path\|->` | Read the description from a file or stdin |
| `-b`, `--branch <name>` | Switch to an existing branch first |
| `--create-branch <name>` | Create a new branch (requires `--base`) |
| `--base <name>` | Base branch for `--create-branch` |
| `--push` / `--no-push` | Push after committing (default: no push) |
| `--mr` / `--no-mr` | Force or suppress the GitLab MR (`--mr` implies `--push`) |
| `--target <branch>` | MR target branch |
| `--refresh-protected` | Re-detect protected branches before committing |
| `-c`, `--config <path>` | Custom config file |

Other commands:

| Command | Description |
| --- | --- |
| `jcommit protected [--refresh]` | Show (or re-detect) this repo's protected branches |
| `jcommit mr [--target <b>] [--push]` | Open an MR for the current branch from its last commit |
| `jcommit config …` | Edit the configuration without prompts |

On missing or conflicting input, headless mode prints a clear error and exits
non-zero instead of waiting on a prompt.

## Development

Prerequisites: Node.js 18.16.1 or later, and npm.

```sh
npm install
npm run build    # compiles src/ → dist/
npm run dev      # watch mode
```

**`dist/` is committed** because the Claude Code plugin runs it directly. After
changing `src/`, run `npm run build` and commit `dist/` along with your change.
CI (`.gitlab-ci.yml`) fails if `dist/` is stale. Check the plugin with
`claude plugin validate .`.

```
.claude-plugin/
├── plugin.json        # plugin manifest
└── marketplace.json   # lets the repo act as its own plugin marketplace
bin/jcommit            # added to Claude's PATH when the plugin is enabled
skills/
├── commit/            # /jcommit:commit (+ references/description.md: description rules)
├── mr/                # /jcommit:mr
└── setup/             # /jcommit:setup
src/
├── index.ts           # entry point / command routing
├── types.ts
├── cli/
│   ├── args.ts            # argument parsing, help
│   └── configCommand.ts   # `jcommit config`
├── config/config.ts   # config file + env overrides
├── services/
│   ├── jira.ts        # Jira API (markdown → ADF descriptions)
│   └── gitlab.ts      # GitLab API (protected branches, MRs)
├── utils/             # colors, git, prompts
└── workflow/
    ├── main.ts           # interactive workflow + setup wizard
    ├── headless.ts       # headless workflow
    ├── steps.ts          # shared steps (git checks, commit, push)
    ├── protected.ts      # protected-branch detection, cache, auto-branch
    └── mergeRequest.ts   # GitLab MR creation
```
