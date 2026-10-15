---
name: describe
description: How to write a jcommit commit description — the short, structured, app-developer-facing text that becomes the commit body, Jira description and GitLab MR description, and is later used as input for WaveMaker app developer documentation. Use when drafting or reviewing a description for jcommit (the commit and mr skills rely on it), or when the user asks to write/improve a commit or MR description.
argument-hint: "[commit-ish to review, default: staged changes]"
allowed-tools: Bash(git status *), Bash(git diff *), Bash(git log *), Bash(git show *)
---

# Writing jcommit descriptions

One description is reused as the **commit body**, the **Jira description**
(new issues) and the **MR description**. It is also **input for WaveMaker app
developer docs** and release notes. Docs writers read many of these in a row,
so every line must earn its place: **short, factual, developer-facing.**

User arguments: `$ARGUMENTS`. With no arguments, describe the staged changes
(`git diff --cached --stat`, then `git diff --cached`). With a commit-ish,
review or rewrite that commit's description (`git show --stat <ref>`,
`git show <ref>`). When you're done, show the result to the user and don't
commit; the `jcommit:commit` skill does that.

## Template

```markdown
## Summary
One or two sentences: what an app developer can now do, or what is fixed.

## Details
- Only developer-visible facts: names in `code`, values, defaults, where it
  appears (Studio panel, runtime web/mobile, generated code, project files).

## Upgrade notes
- Only if existing apps are affected: breaking change, behaviour change,
  deprecation, or a manual step.

Doc-Impact: none | minor | major
Doc-Area: <area, e.g. Widgets/Data Table, Variables, Security, Build & Deploy>
```

`## Summary` and the two trailers are **always** present. `## Details` and
`## Upgrade notes` appear **only when they have content**. Leave out a section
rather than writing "None" or "N/A".

## Size budget, by Doc-Impact

| Doc-Impact | Meaning | Allowed |
| --- | --- | --- |
| `none` | Internal: refactor, tests, CI, tooling, no visible change | Summary (1 sentence) and trailers. Nothing else. |
| `minor` | Small visible fix or tweak | Summary and up to 3 Details bullets |
| `major` | New feature, behaviour change, breaking change, deprecation | Summary, up to 5 Details bullets, and Upgrade notes if needed |

Hard ceiling: **about 15 lines / 150 words** for anything. If a change needs
more, it is probably several changes; suggest splitting the commit. Long
design discussion belongs in the Jira issue or a design doc, not here.

## Don't flood: leave these out

- File lists, class/function/module names that app developers never touch
  (the diff already shows them).
- How it was implemented, step-by-step narration, refactor details.
- Restating the title, or repeating the Summary in Details.
- Test boilerplate ("added unit tests", "tested locally"). Mention verification
  only if it matters to a reader, e.g. "not yet verified on iOS".
- Speculation, marketing words ("powerful", "seamless"), filler ("This commit…",
  "As part of…").
- Anything you can't see in the diff. Ask the user for the "why" instead of
  guessing.

## Writing rules

1. Write for an **app developer building apps in WaveMaker Studio**, not for the
   code reviewer. Use developer vocabulary (*Data Table* widget, `dataset`
   property, `onSelect` event, database variable) rather than internal names.
2. **One bullet = one fact.** Lead with the name and keep each bullet to one
   line where possible: `` `filterType` on date columns: `default` | `daterange` ``.
3. State **defaults and limits** explicitly; docs need them most.
4. Present tense, active voice, no trailing summaries.
5. Pick `Doc-Impact` honestly. Most commits are `none` or `minor`, and keeping
   `major` rare is what makes the filter useful.
6. Trailers go at the very end, after a blank line, with no blank line between
   them, so `git log --format='%(trailers)'` can read them.

## Examples

**major** (new feature):

```markdown
## Summary
Date columns in the Data Table can be filtered by a from–to range, so you no longer need a custom header template.

## Details
- New column property `filterType`: `default` | `daterange` (date and datetime columns only). Default `default`.
- Works with client-side and server-side (`filterMode`) pagination.
- Leaving "from" or "to" empty filters one side only.
- Not available in React Native apps yet.

Doc-Impact: major
Doc-Area: Widgets/Data Table
```

**minor** (visible fix):

```markdown
## Summary
Select widget no longer clears its value when `dataset` reloads with the same items.

Doc-Impact: minor
Doc-Area: Widgets/Select
```

**major** with upgrade notes:

```markdown
## Summary
Login redirects now honour the `redirectTo` query parameter for all security providers.

## Upgrade notes
- Apps that set `redirectTo` to an absolute URL must add the host to `security.allowedRedirectHosts`; otherwise users land on the home page.

Doc-Impact: major
Doc-Area: Security
```

**none** (internal):

```markdown
## Summary
Moves branch resolution into shared workflow steps; no behaviour change.

Doc-Impact: none
Doc-Area: Tooling
```

Too much (don't write this):

```markdown
## Summary
This commit adds a powerful new date range filter feature to the Data Table widget.

## What changed
- Updated table-filter.component.ts, filter.utils.ts and 4 spec files
- Refactored the filter pipeline to use a strategy pattern
- Added a date range filter to the Data Table   ← repeats the summary

## Testing
- Added unit tests; tested locally
```

## Title (`-m`), for reference

One line of about 50–72 characters: imperative and outcome-level, naming the
WaveMaker surface. No trailing period, issue key, quotes or `type:` prefix
(jcommit adds `KEY | `). Example: `Add date range filter to Data Table`.

## Mining history for docs

```sh
git log --grep='^Doc-Impact: major' --format='%h %s'
git log --format='%(trailers:key=Doc-Area,valueonly)%x09%s' | sort
```
