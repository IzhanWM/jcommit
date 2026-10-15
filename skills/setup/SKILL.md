---
name: setup
description: Configure jcommit (Jira credentials and project, protected branches and the <name>/<branch> prefix, GitLab URL/token and automatic merge requests). Use when the user wants to set up or change jcommit settings, or when jcommit reports "Config not found" or "configuration is incomplete".
argument-hint: "[setting to change]"
---

# Configure jcommit

Settings live in `~/.jcommit.json` (override: `$JCOMMIT_CONFIG` or `-c <path>`).
Run the CLI by absolute path, non-interactively:

```sh
node "${CLAUDE_PLUGIN_ROOT}/dist/index.js" config list          # current values, secrets masked
node "${CLAUDE_PLUGIN_ROOT}/dist/index.js" config set <key> <value>
node "${CLAUDE_PLUGIN_ROOT}/dist/index.js" config unset <key>
```

Never run `jcommit setup` yourself — it is an interactive wizard and will hang.

User request: `$ARGUMENTS`

## 1. Secrets — keep them out of the chat

Two tokens are needed: a **Jira API token** (always) and a **GitLab personal
access token** with `api` scope (for protected-branch detection and MRs). Offer
the user these options, in this order, and never ask them to paste a token
into the conversation:

1. **Environment variables (recommended)** — add to their shell profile, then
   restart Claude Code so the Bash tool inherits them:
   ```sh
   export JIRA_API_TOKEN=...   # https://id.atlassian.com/manage-profile/security/api-tokens
   export GITLAB_TOKEN=...     # GitLab → Preferences → Access tokens, scope: api
   ```
   (`JCOMMIT_JIRA_API_TOKEN` / `JCOMMIT_GITLAB_TOKEN` also work.) Values in the
   config file win over the environment.
2. **Wizard in their own terminal** — it covers every setting and prompts for
   tokens there:
   ```sh
   node "${CLAUDE_PLUGIN_ROOT}/dist/index.js" setup
   ```
   (Print this command with the path already filled in.)
3. **In the chat** — only if the user insists, warn that the token will be in the
   transcript, then `config set jiraApiToken <token>` / `config set gitlab.token <token>`.

To check a token is present without revealing it: `config get jiraApiToken`
(masked) or `test -n "$JIRA_API_TOKEN" && echo set`.

## 2. Settings

Ask for what is missing (use AskUserQuestion for yes/no choices), then
`config set` each value. Never invent values.

| Key | Required | Meaning |
| --- | --- | --- |
| `jiraDomain` | yes | e.g. `wavemaker.atlassian.net` (no `https://`) |
| `jiraEmail` | yes | Atlassian account email |
| `jiraProjectId` | yes | Numeric project ID |
| `jiraIssueTypeId` | yes | Numeric issue type ID for new issues |
| `jiraAssigneeId` | no | Atlassian accountId to assign new issues to |
| `protectedBranches` | no | Comma list, wildcards allowed (`master,release-*`). Default `master`. Merged with branches detected from GitLab. |
| `branchPrefix` | no | Prefix for auto-created branches `<prefix>/<branch>`. Default: local part of `jiraEmail`. |
| `autoBranchOnProtected` | no | `false` = abort on protected branches instead of auto-branching. Default `true`. |
| `protectedBranchCacheTtlHours` | no | How long detected protected branches are cached. Default `24`. |
| `gitlab.url` | no | e.g. `https://gitlab.wavemaker.com`. Default: host of the `origin` remote (set it when the SSH host is an alias). |
| `gitlab.autoCreateMr` | no | `true` = open an MR after every push. |
| `gitlab.defaultTargetBranch` | no | MR target when none is implied. Default: branch you started from, else the project default. |
| `gitlab.removeSourceBranch` | no | Default `true`. |
| `gitlab.squash`, `gitlab.draft` | no | Default `false`. |
| `gitlab.labels` | no | Comma list added to every MR. |
| `gitlab.assigneeIds`, `gitlab.reviewerIds` | no | Comma list of numeric GitLab user IDs. |

### Looking up IDs

If `JIRA_API_TOKEN` is in the environment you can look IDs up without seeing
the token (substitute domain, email and project key):

```sh
curl -s -u "you@company.com:$JIRA_API_TOKEN" \
  https://<jiraDomain>/rest/api/3/project/<PROJECT_KEY> \
  | node -e 'const p=JSON.parse(require("fs").readFileSync(0));console.log("projectId",p.id);p.issueTypes.forEach(t=>console.log(t.id,t.name))'
curl -s -u "you@company.com:$JIRA_API_TOKEN" https://<jiraDomain>/rest/api/3/myself \
  | node -e 'console.log("accountId",JSON.parse(require("fs").readFileSync(0)).accountId)'
```

GitLab user IDs: `curl -s -H "PRIVATE-TOKEN: $GITLAB_TOKEN" "<gitlab.url>/api/v4/users?username=<name>"`.

## 3. Verify

Inside a repo:

```sh
node "${CLAUDE_PLUGIN_ROOT}/dist/index.js" config list
node "${CLAUDE_PLUGIN_ROOT}/dist/index.js" protected --refresh
```

`protected --refresh` reads protected branches from GitLab and stores them per
repository in the config (`detected (GitLab)`). `detected (remote default
branch)` means GitLab wasn't reachable or no token is set — only the default
branch is known. Finish with a short summary of what is configured and that
`/jcommit:commit` is ready to use.
