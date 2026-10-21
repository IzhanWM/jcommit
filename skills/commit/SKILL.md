---
name: commit
description: Commit staged changes with jcommit — a Jira-linked commit that always gets a short, documentation-ready description written from the staged diff, then optionally pushed with a GitLab merge request opened automatically. Moves work off protected branches to <name>/<branch> on its own. Use when the user asks to commit (with jcommit), make a Jira-linked commit, create a Jira ticket for their changes, push and raise an MR, or run the jcommit workflow.
argument-hint: "[JIRA-KEY] [--push] [--mr] [extra instructions]"
allowed-tools: Bash(git status *), Bash(git diff *), Bash(git log *), Bash(git branch *), Bash(git rev-parse *)
---

# jcommit — Jira-linked, documentation-ready commits

jcommit commits the **staged** changes as:

```
KEY | <title>                      ← subject line (Jira-title style)

## Summary                         ← body: a short description you write
...
Release-Note: Bug Fixes
Release-Area: User Interface
```

**Every commit gets a description; this is the default and needs no request
from the user.** It becomes the commit body, the Jira issue description (new
issues) and the GitLab merge request description, and it's used as input for
**WaveMaker app developer documentation**. Keep it short and developer-facing,
per [references/description.md](references/description.md).

User arguments: `$ARGUMENTS`

## How to run the CLI

The plugin bundles the CLI. Always call it by absolute path (a globally
installed npm `jcommit` may be an older version without these flags):

```sh
node "${CLAUDE_PLUGIN_ROOT}/dist/index.js" <flags>
```

Below, `jcommit` is shorthand for that command. **Always run it headless**
(`-t` and/or `-m` turn headless on). Never run bare `jcommit` or `jcommit setup`
— they wait on stdin and will hang.

## Workflow

1. **Preflight**
   - Inside a git repo, with something staged: `git status --short`,
     `git diff --cached --stat`. If nothing is staged, ask which files to stage
     (or `git add` what the user named) — jcommit commits only the index.
   - Config exists: `jcommit config list` (secrets are masked). If it fails with
     *Config not found* or required fields are missing, run the
     `jcommit:setup` skill first.
   - Current branch: `git branch --show-current`. If it is protected (see
     `jcommit protected`), jcommit **automatically** creates
     `<branchPrefix>/<branch>` from it and commits there — tell the user that
     will happen; no action needed.

2. **Read the change.** The title and description are generated from the
   code, not from the conversation: `git diff --cached --stat`, then
   `git diff --cached` (for large diffs, the stat plus the key hunks). Also run
   `git log -5 --format=%s` for local style.

3. **Pick the Jira mode**
   | Situation | Flags |
   | --- | --- |
   | User gave a ticket key | `-t KEY -m "<title>"` (or `-t KEY` alone to reuse the Jira summary as `Fix: <summary>`). Pass the description with `-F -` either way. |
   | No key given | Run `jcommit issues --json` and compare the user's open issues with the diff. If one clearly matches, propose it (`-t KEY`). Otherwise list them briefly and ask which one to use, or whether to create a new issue. In a non-interactive run, use a clear match; if there's none, create a new issue only if the prompt asked for that, otherwise stop and say so. |
   | Create a new issue | `-m "<title>"` — **creates a real Jira issue**; confirm first |

4. **Generate the title and description from the code. Always do this; never
   commit without a description, and don't ask the user to write it.** Read [references/description.md](references/description.md)
   for the full rules and examples. The essentials:
   - Title (`-m`): one line, about 50–72 characters, imperative, outcome-level,
     naming the WaveMaker feature.
   - `## Summary`: always **one sentence**, the release-note body. Active
     voice, present tense, no marketing words; bug fixes start with "Fixed".
   - `## Details` / `## Upgrade notes`: only when they hold developer-visible
     facts.
   - Trailers, matching the docs' release notes structure:
     `Release-Note: Features | Enhancements | Bug Fixes | None` (always);
     `Release-Area: User Interface | Backend | Platform | Product Ecosystem`;
     `Platforms: Web, Mobile` (if platform-specific); optional `Component:`;
     `Docs: /docs/...` only for a page you know exists.
   - Size follows `Release-Note`: `None` = one sentence; `Bug Fixes` =
     Summary only (up to 3 "Fixed" bullets for related symptoms);
     `Enhancements` up to 3 bullets; `Features` up to 5 plus upgrade notes.
     About 15 lines at most.
   - No file lists, implementation narration, test boilerplate, repeated title
     or "None" sections.

   Show the generated title and description to the user before committing;
   they can ask for changes.

5. **Decide push / MR** — check `jcommit config get gitlab.autoCreateMr`.
   - Default is commit only (no push).
   - `--push` pushes; if `gitlab.autoCreateMr` is `true`, pushing **also opens a
     GitLab MR**. `--mr` forces an MR (implies `--push`); `--no-mr` suppresses it.
   - MR target: `--target <branch>`, else the protected branch the work was
     moved off, else `--base` of `--create-branch`, else
     `gitlab.defaultTargetBranch`, else the project default branch.
   - Without a GitLab token the MR is created through git push options: same
     title, target, labels and assignees, but a one-line description.
   - Pushing and opening an MR are outward-facing: get the user's go-ahead unless
     they already asked for it.

6. **Run** — pass the description on stdin with a quoted heredoc so nothing is
   shell-expanded:

   ```sh
   node "${CLAUDE_PLUGIN_ROOT}/dist/index.js" -t WMS-1234 \
     -m "Add date range filter to Data Table" --push -F - <<'EOF'
   ## Summary
   Filter Data Table date columns by a from–to range without a custom header template.

   ## Details
   - New column property `filterType`: `default` | `daterange`. Default `default`.

   Release-Note: Features
   Release-Area: User Interface
   Platforms: Web
   Component: Table and DataTable
   EOF
   ```

7. **Report** the commit subject, the branch it landed on (mention an
   auto-created branch), and the MR URL if one was created. A non-zero exit
   after "Git push successful" means only the MR step failed — the commit and
   push stand; relay the error.

## Flag reference

| Flag | Meaning |
| --- | --- |
| `-t`, `--ticket <KEY>` | Use existing Jira issue, e.g. `WMS-123` |
| `-m`, `--message <text>` | Title: new-issue summary, or custom title with `-t`. Single line. |
| `-d`, `--description <text>` | Description (commit body, new Jira issue description, MR description) |
| `-F`, `--description-file <path\|->` | Read the description from a file or stdin (`-`) — preferred |
| `-b`, `--branch <name>` | Switch to an existing branch before committing |
| `--create-branch <name> --base <b>` | Create a branch from `<b>` first (from `origin/<b>` when the remote has it) |
| `--local-base` / `--push-base` | Only when `<b>` exists locally but not on origin: branch from the local copy as-is, or push `<b>` to origin first. Pass one only after the user chooses. |
| `--push` / `--no-push` | Push after commit (default: no push) |
| `--mr` / `--no-mr` | Force / suppress the GitLab MR (default: `gitlab.autoCreateMr` when pushed) |
| `--target <branch>` | MR target branch |
| `--refresh-protected` | Re-detect protected branches from GitLab before committing |
| `-c`, `--config <path>` | Custom config file |

Other commands: `jcommit issues [--json] [--limit <n>]` (the user's open Jira
issues), `jcommit protected [--refresh]` (show/re-detect protected
branches for this repo), `jcommit mr [--target <b>] [--push]` (open an MR for
the current branch from its last commit), `jcommit config list|get|set|unset|path`.

## Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| `No staged changes found.` | Stage files first. |
| `Base branch '<b>' exists only locally` / `Could not fetch '<b>' from origin` | Nothing was created. Ask the user (AskUserQuestion) whether to branch from their local `<b>` as-is (`--local-base`), push `<b>` to origin first (`--push-base`, which publishes that branch), or cancel. Then rerun the same command with their choice. In a non-interactive run, stop and report the two options. |
| `Base branch '<b>' was not found locally or on origin` | Check the name with `git branch -a`. |
| `Description is long (…)` | Warning only. Trim it to the budget in references/description.md, or split the commit. |
| `Operation cancelled. '<b>' is protected.` | `autoBranchOnProtected` is `false`; switch branch or `jcommit config unset autoBranchOnProtected`. |
| `Config not found` / `configuration is incomplete` | Run the `jcommit:setup` skill. |
| `Invalid Jira ticket key` | Use the `PROJ-123` form. |
| 401/403 from Jira | Bad/expired token or wrong `jiraEmail`. |
| `No GitLab token — creating the merge request with git push options` | Expected without a token. The MR gets a one-line description; set `GITLAB_TOKEN` for the full one. |
| `remote does not support push options` / `did not process the merge request options` | No MR was created (commit and push are fine). Set a GitLab token, or open the MR in GitLab. |
| `GitLab API 401/403` | Token lacks `api` scope or project access. |
| `GitLab API 404` | Wrong `gitlab.url` / project path — check `git remote -v`; set `gitlab.url` for SSH host aliases. |
| `Git push failed` | No remote access — check `git remote -v` and credentials. |
