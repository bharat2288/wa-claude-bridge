---
type: project-home
project: wa-claude
date: 2026-03-07
cssclasses:
  - project-home
---
# WA Claude
*[[dev-hub|Hub]] · [[README|GitHub]]*

WhatsApp-to-Claude Code bridge. Node.js daemon routing WhatsApp groups to persistent Claude Code PTY sessions for mobile access.

## Specs

```dataview
TABLE rows.file.link as Specs
FROM "wa-claude/specs"
WHERE type AND type != "spec-prompts"
GROUP BY type
SORT type ASC
```
> [!warning]- Open Errors (`$= dv.pages('"knowledge/exports/errors"').where(p => p.project == "wa-claude" && !p.resolved).length`)
> ```dataview
> TABLE module, date
> FROM "knowledge/exports/errors"
> WHERE project = "wa-claude" AND resolved = false
> SORT date DESC
> LIMIT 5
> ```

> [!info]- Decisions (`$= dv.pages('"knowledge/exports/decisions"').where(p => p.project == "wa-claude").length`)
> ```dataview
> TABLE date
> FROM "knowledge/exports/decisions"
> WHERE project = "wa-claude"
> SORT date DESC
> LIMIT 5
> ```
>
> > [!info]- All Decisions
> > ```dataview
> > TABLE date
> > FROM "knowledge/exports/decisions"
> > WHERE project = "wa-claude"
> > SORT date DESC
> > ```

> [!tip]- Learnings (`$= dv.pages('"knowledge/exports/learnings"').where(p => p.project == "wa-claude").length`)
> ```dataview
> TABLE tags
> FROM "knowledge/exports/learnings"
> WHERE project = "wa-claude"
> SORT date DESC
> LIMIT 5
> ```
>
> > [!tip]- All Learnings
> > ```dataview
> > TABLE tags
> > FROM "knowledge/exports/learnings"
> > WHERE project = "wa-claude"
> > SORT date DESC
> > ```

> [!abstract]- Project Plans (`$= dv.pages('"knowledge/plans"').where(p => p.project == "wa-claude").length`)
> ```dataview
> TABLE title, default(date, file.ctime) as Date
> FROM "knowledge/plans"
> WHERE project = "wa-claude"
> SORT default(date, file.ctime) DESC
> ```

> [!note]- Sessions (`$= dv.pages('"knowledge/sessions/wa-claude"').length`)
> ```dataview
> TABLE topic
> FROM "knowledge/sessions/wa-claude"
> SORT file.mtime DESC
> LIMIT 5
> ```
>
> > [!note]- All Sessions
> > ```dataview
> > TABLE topic
> > FROM "knowledge/sessions/wa-claude"
> > SORT file.mtime DESC
> > ```
