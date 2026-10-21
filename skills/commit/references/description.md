# Writing the description (default for every commit)

One description is reused as the **commit body**, the **Jira description**
(new issues) and the **MR description**. It is also the raw input for the
**WaveMaker docs** (`docs.wavemaker.ai`, repo `IzhanWM/docs`). Its release notes
skill (`wm-ai-release-notes`) needs, for every shipped item:

- a **tab**: Features, Enhancements or Bug Fixes;
- a **section** (accordian): User Interface, Backend, Platform or Product
  Ecosystem;
- **platform pills**: Web and/or Mobile;
- a **one-sentence body**;
- an optional, **verified doc link**.

The description captures exactly those, so release notes can be assembled
straight from history. Docs writers read many of these in a row, so keep them
**short, factual and developer-facing**.

**The description is generated automatically from the code.** The developer
doesn't write it or answer questions about it; they only see it before the
commit. The `jcommit:commit` and `jcommit:mr` skills generate it on every
commit from these sources, in order:

1. The staged diff: `git diff --cached --stat`, then `git diff --cached`. For a
   large diff, use the stat plus the key hunks.
2. What the diff itself says: new or changed public names (widgets,
   properties, events, APIs, config keys), code comments, test names and
   assertions.
3. The Jira issue, when committing against one: its summary and type (Bug,
   Story…) explain the intent.

Never invent a motivation that none of these show. If the "why" isn't evident,
describe the behaviour change only.

## Template

```markdown
## Summary
One sentence: the release-note body.

## Details
- Only when one sentence isn't enough: developer-visible facts for the doc.

## Upgrade notes
- Only if existing apps are affected: breaking change, behaviour change,
  deprecation, or a manual step.

Release-Note: Features | Enhancements | Bug Fixes | None
Release-Area: User Interface | Backend | Platform | Product Ecosystem
Platforms: Web, Mobile
Component: Table and DataTable
Docs: /docs/user-interfaces/web/develop/working-with-layouts/auto-layout
```

`## Summary` and `Release-Note:` are **always** present. Everything else
appears **only when it has content**: leave out a section or trailer rather than
writing "None" or "N/A".

## Summary: the release-note sentence

Exactly **one sentence**, written so it can be pasted under the release note
heading unchanged:

- Active voice, present tense, sentence case, no marketing words ("powerful",
  "seamless", "exciting", "robust").
- Say what the capability does for an app developer, not how it was built.
- **Bug fixes start with "Fixed"** and describe the symptom the developer saw,
  adding the cause only if it helps: *Fixed clicking a column header to sort
  throwing a TypeError because the sort callback's data was missing the
  `sortDirection` key.*
- Use WaveMaker product names exactly as the docs do: WaveMaker Agent, Studio,
  Style Workspace, Auto Layout, Design System projects, Prefabs, Service / CRUD /
  Live variables, Web (Angular or React), Mobile (React Native).

## Trailers

Trailers go at the very end, after a blank line, one per line, with no blank
lines between them, so `git log --format='%(trailers)'` can read them.

| Trailer | Values | Rule |
| --- | --- | --- |
| `Release-Note` | `Features` · `Enhancements` · `Bug Fixes` · `None` | Always. Features = new capability; Enhancements = improves an existing one; Bug Fixes = broken, now works; None = internal (refactor, tests, CI, tooling). |
| `Release-Area` | `User Interface` · `Backend` · `Platform` · `Product Ecosystem` | Unless `None`. UI = visual editor, canvas, widgets, layout, theming. Backend = APIs, data sources, Java/Spring services, variables. Platform = WaveMaker Agent, Studio platform, build pipeline, authentication, project settings. Product Ecosystem = docs, Academy, Storybook, Marketplace, SDKs, CLI. A widget fix stays in User Interface even if the code change was backend. |
| `Platforms` | `Web`, `Mobile`, or `Web, Mobile` | Only when the change is platform-specific or applies to app platforms. Omit for platform-neutral changes (backend, docs). |
| `Component` | Widget or feature name, e.g. `Table and DataTable`, `WaveMaker Agent`, `Style Workspace` | Optional. Used to group related bug fixes under one heading. |
| `Docs` | `/docs/<section>/<page>` URL path, no `.md`/`.mdx` | Only for a page you **know** exists (the user named it, or you checked the docs repo). Never guess. Leave it out if a new doc is needed and say so in the chat instead. |

Only these values. Never invent a new tab, section or platform name; the release
notes structure is fixed.

### Deriving the trailers from the code

| Trailer | Signals in the diff |
| --- | --- |
| `Release-Note` | New public widget, property, event, API, config key or command → `Features`. Changed default, extended option, performance or UX improvement to something that exists → `Enhancements`. Corrects wrong behaviour (a guard, null check, off-by-one, a regression test reproducing a failure, or a Jira issue of type Bug) → `Bug Fixes`. Only tests, CI, build scripts, refactors, comments or dependency bumps with no visible effect → `None`. |
| `Release-Area` | Components, widgets, styles, themes, canvas or layout code → `User Interface`. Java/Spring services, controllers, REST APIs, data sources, queries, variables → `Backend`. Agents, Studio shell, build/deploy pipeline, auth, project settings → `Platform`. Docs, samples, Storybook, Marketplace, SDK or CLI → `Product Ecosystem`. Pick by what the app developer sees, not where the code lives. |
| `Platforms` | Only Angular or React web code → `Web`. Only React Native / mobile code → `Mobile`. Shared runtime or code paths for both → `Web, Mobile`. Server-side or tooling only → leave it out. |
| `Component` | The widget or feature most of the diff is about, named as the docs name it (e.g. `Table and DataTable`). Leave it out if the change spans several. |
| `Docs` | Only when the code references a docs URL, or a checkout of the docs repo shows the page exists. Otherwise leave it out. |

When the signals conflict, pick the one an app developer would notice first.

## Size budget, by Release-Note

| Release-Note | Allowed |
| --- | --- |
| `None` | Summary (one sentence) and `Release-Note: None`. Nothing else. |
| `Bug Fixes` | Summary and trailers. Details only when one change fixes several related symptoms: up to 3 bullets, each starting "Fixed". |
| `Enhancements` | Summary, up to 3 Details bullets, and trailers |
| `Features` | Summary, up to 5 Details bullets, Upgrade notes if needed, and trailers |

Hard ceiling: **about 15 lines / 150 words**. If a change needs more, it is
probably several changes; suggest splitting the commit. Long design discussion
belongs in the Jira issue or a design doc, not here.

## Don't flood: leave these out

- File lists, class/function/module names that app developers never touch
  (the diff already shows them).
- How it was implemented, step-by-step narration, refactor details.
- Restating the title, or repeating the Summary in Details.
- Test boilerplate ("added unit tests", "tested locally"). Mention verification
  only if it matters to a reader, e.g. "not yet verified on iOS".
- Speculation, filler ("This commit…", "As part of…").
- Anything the code or the Jira issue doesn't support: no guessed motivation,
  platforms or doc pages.

## Details: writing rules

1. Write for an **app developer building apps in WaveMaker Studio**. Use the
   names they see (*Data Table* widget, `dataset` property, `onSelect` event,
   **Font.Family** token), not internal ones.
2. **One bullet = one fact**, leading with the name:
   `` `filterType` on date columns: `default` | `daterange` ``. Bold UI labels
   (**Text** tab), put properties and values in `code`.
3. State **defaults and limits** explicitly; docs need them most.

## Examples

**Features**:

```markdown
## Summary
Filter Data Table date columns by a from–to range without a custom header template.

## Details
- New column property `filterType`: `default` | `daterange` (date and datetime columns only). Default `default`.
- Works with client-side and server-side (`filterMode`) pagination.
- Leaving "from" or "to" empty filters one side only.

Release-Note: Features
Release-Area: User Interface
Platforms: Web
Component: Table and DataTable
```

**Bug Fixes**:

```markdown
## Summary
Fixed the Select widget clearing its value when `dataset` reloads with the same items.

Release-Note: Bug Fixes
Release-Area: User Interface
Platforms: Web, Mobile
Component: Select
```

**Enhancements** with upgrade notes:

```markdown
## Summary
Login redirects honour the `redirectTo` query parameter for all security providers.

## Upgrade notes
- Apps that set `redirectTo` to an absolute URL must add the host to `security.allowedRedirectHosts`; otherwise users land on the home page.

Release-Note: Enhancements
Release-Area: Platform
Docs: /docs/apis-and-services/security/providers/login-configuration
```

**None** (internal):

```markdown
## Summary
Moves branch resolution into shared workflow steps with no behaviour change.

Release-Note: None
```

Too much (don't write this):

```markdown
## Summary
This commit adds a powerful new date range filter feature to the Data Table widget. It also refactors filtering.

## What changed
- Updated table-filter.component.ts, filter.utils.ts and 4 spec files
- Refactored the filter pipeline to use a strategy pattern
- Added a date range filter to the Data Table   ← repeats the summary

## Testing
- Added unit tests; tested locally
```

## Title (`-m`), for reference

One line of about 50–72 characters: imperative and outcome-level, naming the
WaveMaker feature, so it converts easily into a 4–7 word release-note heading
("Add date range filter to Data Table" → "Date range filter for Data Table").
No trailing period, issue key, quotes or `type:` prefix (jcommit adds `KEY | `).

## From history to release notes

List a release's items, grouped by tab and section, as input for the docs repo's
`wm-ai-release-notes` skill:

```sh
git log <previous-tag>..<release-tag> --no-merges \
  --format='%(trailers:key=Release-Note,valueonly,separator=)|%(trailers:key=Release-Area,valueonly,separator=)|%(trailers:key=Platforms,valueonly,separator=)|%s' \
  | grep -v '^None|' | grep -v '^|' | sort
```

To see a single item's full description: `git show -s --format=%B <sha>`.
