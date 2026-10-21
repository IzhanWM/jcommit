---
name: issues
description: Show the user's open Jira issues (assigned to them, not done) with jcommit — key, status, type, priority and summary. Use when the user asks to see their Jira tasks/issues/tickets, what they're assigned, or what to work on, or wants to pick a ticket to commit against.
argument-hint: "[filter words] [--limit <n>]"
---

# Show my Jira issues

```sh
node "${CLAUDE_PLUGIN_ROOT}/dist/index.js" issues --json --limit 50
```

This returns open issues assigned to the user, most recently updated first:
`statusCategory != Done`, so custom states like *In Review* are included.
"The user" means `jiraAssigneeId` from the config, or the owner of the Jira
token when that isn't set. Each item has `key`, `summary`, `status`,
`priority`, `type` and `url`.

User request: `$ARGUMENTS`

1. Run the command. If it fails with *Config not found* or *needs: …*, use the
   `jcommit:setup` skill. A 401/403 means a bad token or the wrong `jiraEmail`.
2. If the user gave filter words (e.g. "bugs", "table", "in review"), keep only
   the issues whose summary, type or status match.
3. Show a compact table: key (as a link to `url`), status, type, priority and
   summary. Group by status if there are many. Say how many there are, and
   don't paste the raw JSON.
4. If there are staged changes (`git diff --cached --stat`), read the diff
   (`git diff --cached`) and compare it with the issues. Base the match on the
   code, not file names alone. Point out an issue that clearly matches and offer
   to commit against it with `/jcommit:commit <KEY>`.

Without Claude, the same list is available in a terminal (with the CLI
installed) as `jcommit issues`.
