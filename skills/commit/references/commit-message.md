# Commit title & description (documentation-ready)

jcommit writes one artifact that is reused three times: the **commit body**, the
**Jira description** (new issues) and the **GitLab MR description**. It is later
mined to write **WaveMaker app developer documentation** and release notes, so
write it for an *app developer building apps in WaveMaker Studio*, not for the
reviewer of this diff.

## Title (`-m`)

jcommit prepends the issue key: `KEY | <title>`.

- **One line, ~50–72 chars**, no trailing period, no issue key, no quotes, no
  `type:` prefix.
- **Imperative, outcome-level**: what an app developer gets or what is fixed —
  `Add date range filter to Data Table`, not `Update table.component.ts`.
- **Name the WaveMaker surface** when there is one (widget, property, event,
  variable, service, prefab, Studio panel, CLI, build/deploy).
- **One theme.** If the staged diff mixes unrelated changes, say so and suggest
  splitting the commit.

## Description (`-F -`)

Markdown with these sections, in this order. Keep the headings exactly — tools
and docs writers rely on them. Use `- ` bullets; no tables, no images, no HTML.

```markdown
## Summary
1–3 sentences: what changed and why it matters to app developers.

## What changed
- One bullet per developer-visible change: widget/property/event/API names in
  `code`, old → new behaviour, new defaults.

## Developer impact
- How an app developer uses it or is affected: where it appears (Studio, runtime
  web / mobile, generated code, project config), required steps, migration or
  upgrade notes, breaking changes, deprecations.
- "None — internal change" when nothing is visible to app developers.

## Documentation notes
- Doc-ready facts: feature/setting name, where to find it, valid values and
  defaults, a minimal usage example, limitations and gotchas.
- "None" for internal changes.

## Testing
- How it was verified (unit/e2e tests, manual steps, platforms/browsers).

Doc-Impact: none | minor | major
Doc-Area: <area, e.g. Widgets/Data Table, Variables, Security, Build & Deploy>
```

The last two lines are **git trailers** (a blank line before them, no blank line
between them). They let the docs team filter history:

```sh
git log --format='%h %s' --grep='^Doc-Impact: major' 
git log --format='%(trailers:key=Doc-Area,valueonly)%x09%s'
```

`Doc-Impact`: `major` = new feature, behaviour change, breaking change or
deprecation; `minor` = small visible fix or tweak; `none` = internal only.

## Rules

1. Read what is actually staged (`git diff --cached --stat`, `git diff --cached`)
   — never guess from the conversation.
2. Be factual and specific; only describe what the diff does. Don't invent
   tests, platforms or motivations — ask the user if the "why" isn't clear.
3. Prefer developer vocabulary (`dataset`, `onSelect` event, *Data Table*
   widget) over internal class/file names; mention files only when the
   developer touches them (e.g. `app.variables.json`, `profiles/*.properties`).
4. Keep it tight: Summary ≤ 3 sentences, ≤ ~6 bullets per section.
5. Show the title and description to the user before committing; it may also
   create a real Jira issue.

## Example

Title: `Add date range filter to Data Table`

```markdown
## Summary
Data Table columns of type date can now be filtered by a from–to range, so app
developers no longer need a custom header template for date filtering.

## What changed
- New column property `filterType` with value `daterange` for date columns.
- Range filter applies to both client-side and server-side (`filterMode`)
  pagination.

## Developer impact
- Opt-in: existing tables are unchanged. Set *Filter type → Date range* on a date
  column in the Studio properties panel.
- Server-side filtering sends `<column> between <from> and <to>` to the bound
  database variable.

## Documentation notes
- Data Table → Columns → `filterType`: `default` | `daterange` (date and
  datetime columns only). Default `default`.
- Empty "from" or "to" filters one side only.
- Not supported in mobile (React Native) apps yet.

## Testing
- Unit tests for the range predicate; manually verified in Chrome and Firefox with
  client- and server-side pagination.

Doc-Impact: major
Doc-Area: Widgets/Data Table
```

Internal-only change (still useful in history):

```markdown
## Summary
Refactors branch resolution into shared workflow steps; no behaviour change.

## What changed
- Moved branch create/switch logic into `steps.ts`.

## Developer impact
- None — internal change.

## Documentation notes
- None.

## Testing
- Existing workflow exercised manually in interactive and headless modes.

Doc-Impact: none
Doc-Area: Tooling
```
