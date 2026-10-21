---
name: mr
description: Open a GitLab merge request for the current branch with jcommit, using the last commit's title and documentation-ready description (reuses an already open MR for the branch). Use when the user asks to create/raise/open an MR or merge request for work that is already committed.
argument-hint: "[--target <branch>] [--push]"
---

# Open a GitLab merge request

For committing *and* opening an MR in one go, use the `jcommit:commit` skill
with `--mr`. This skill is for work that is already committed.

User arguments: `$ARGUMENTS`

1. Check the branch and what the MR will contain:
   `git branch --show-current`, `git log -1 --format=%B`, and whether the branch
   is pushed: `git status -sb` (look for `[ahead N]` or no upstream).
2. The MR title is the last commit subject and its description is the commit
   body plus a link to the Jira issue in the subject. If the body is missing
   or thin, write one by default per
   [../commit/references/description.md](../commit/references/description.md)
   and pass it with `-F -` (heredoc) — it is used for the MR only.
3. Confirm with the user (opening an MR is visible to the team), then run:

   ```sh
   node "${CLAUDE_PLUGIN_ROOT}/dist/index.js" mr [--push] [--target <branch>] [-F - <<'EOF' ... EOF]
   ```

   - `--push` pushes the branch first (needed if it isn't on the remote yet).
   - Target defaults to `--target`, else `gitlab.defaultTargetBranch`, else the
     project's default branch.
   - If an MR is already open for the branch, its URL is printed instead.
   - Without a GitLab token this always pushes, because the MR is created through
     git push options. It only works if the push sends new commits. For a branch
     that's already up to date, the user needs a token (or can open the MR in
     GitLab).
4. Report the MR URL. On `GitLab token missing` / API errors, see the
   `jcommit:setup` skill.
