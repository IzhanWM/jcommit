---
name: commit
description: Commit staged changes with jcommit — a Jira-linked commit whose title and structured, documentation-ready description are written from the staged diff, then optionally pushed with a GitLab merge request opened automatically. Moves work off protected branches to <name>/<branch> on its own. Use when the user asks to commit (with jcommit), make a Jira-linked commit, create a Jira ticket for their changes, push and raise an MR, or run the jcommit workflow.
argument-hint: "[JIRA-KEY] [--push] [--mr] [extra instructions]"
allowed-tools: Bash(git status *), Bash(git diff *), Bash(git log *), Bash(git branch *), Bash(git rev-parse *)
---

# jcommit — Jira-linked, documentation-ready commits

jcommit commits the **staged** changes as:

```
KEY | <title>                      ← subject line (Jira-title style)

## Summary                         ← body: the description you write
...
```

The same description becomes the Jira issue description (new issues) and the
GitLab merge request description, so **WaveMaker app developer documentation
can be produced straight from commit history**. Writing that description well is
the main job of this skill.

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

2. **Read the change** — never write from the conversation alone:
   `git diff --cached --stat`, then `git diff --cached` (for large diffs, the
   stat plus the key hunks). Also `git log -5 --format=%s` for local style.

3. **Pick the Jira mode**
   | Situation | Flags |
   | --- | --- |
   | User gave a ticket key | `-t KEY -m "<title>"` (or `-t KEY` alone to reuse the Jira summary as `Fix: <summary>`) |
   | No ticket — create one | `-m "<title>"` — **creates a real Jira issue**; confirm first |

4. **Write the title and description** following
   [references/commit-message.md](references/commit-message.md): a single-line
   Jira-title (`-m`) plus the structured, app-developer-facing description
   (`-F -`). Show both to the user and let them adjust before committing.

5. **Decide push / MR** — check `jcommit config get gitlab.autoCreateMr`.
   - Default is commit only (no push).
   - `--push` pushes; if `gitlab.autoCreateMr` is `true`, pushing **also opens a
     GitLab MR**. `--mr` forces an MR (implies `--push`); `--no-mr` suppresses it.
   - MR target: `--target <branch>`, else the protected branch the work was
     moved off, else `--base` of `--create-branch`, else
     `gitlab.defaultTargetBranch`, else the project default branch.
   - Pushing and opening an MR are outward-facing: get the user's go-ahead unless
     they already asked for it.

6. **Run** — pass the description on stdin with a quoted heredoc so nothing is
   shell-expanded:

   ```sh
   node "${CLAUDE_PLUGIN_ROOT}/dist/index.js" -t WMS-1234 \
     -m "Add date range filter to Data Table" --push -F - <<'EOF'
   ## Summary
   ...
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
| `--create-branch <name> --base <b>` | Create a branch from `<b>` first |
| `--push` / `--no-push` | Push after commit (default: no push) |
| `--mr` / `--no-mr` | Force / suppress the GitLab MR (default: `gitlab.autoCreateMr` when pushed) |
| `--target <branch>` | MR target branch |
| `--refresh-protected` | Re-detect protected branches from GitLab before committing |
| `-c`, `--config <path>` | Custom config file |

Other commands: `jcommit protected [--refresh]` (show/re-detect protected
branches for this repo), `jcommit mr [--target <b>] [--push]` (open an MR for
the current branch from its last commit), `jcommit config list|get|set|unset|path`.

## Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| `No staged changes found.` | Stage files first. |
| `Operation cancelled. '<b>' is protected.` | `autoBranchOnProtected` is `false`; switch branch or `jcommit config unset autoBranchOnProtected`. |
| `Config not found` / `configuration is incomplete` | Run the `jcommit:setup` skill. |
| `Invalid Jira ticket key` | Use the `PROJ-123` form. |
| 401/403 from Jira | Bad/expired token or wrong `jiraEmail`. |
| `GitLab token missing` | `GITLAB_TOKEN` env var or `gitlab.token` (see `jcommit:setup`). |
| `GitLab API 401/403` | Token lacks `api` scope or project access. |
| `GitLab API 404` | Wrong `gitlab.url` / project path — check `git remote -v`; set `gitlab.url` for SSH host aliases. |
| `Git push failed` | No remote access — check `git remote -v` and credentials. |
