# Issue tracker: GitHub

Issues and PRDs for this repo live as GitHub issues. Use the `gh` CLI for all operations.

## Conventions

- **Create an issue**: `gh issue create --title "..." --body "..."`. Use a heredoc for multi-line bodies.
- **Read an issue**: `gh issue view <number> --comments`, filtering comments by `jq` and also fetching labels.
- **List issues**: `gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'` with appropriate `--label` and `--state` filters.
- **Comment on an issue**: `gh issue comment <number> --body "..."`
- **Apply / remove labels**: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- **Close**: `gh issue close <number> --comment "..."`

Infer the repo from `git remote -v` — `gh` does this automatically when run inside a clone.

## When a skill says "publish to the issue tracker"

Create a GitHub issue.

## When a skill says "fetch the relevant ticket"

Run `gh issue view <number> --comments`.

## Wayfinding operations

Native sub-issues and issue-links REST endpoints return 404 on this repo, so the **body convention** is used for both parentage and blocking:

- **Parent/child**: the wayfinder map is labeled `wayfinder:map`; its child tickets carry a footer in their body: `*Wayfinder 票 · 子票：[<map title>](<map url>)*`.
- **Blocking**: a blocked ticket lists a `## Blocked by` section in its body with named links to its blockers. A ticket is **unblocked** when every ticket named there is closed.
- **Labels**: `wayfinder:map`, `wayfinder:research`, `wayfinder:prototype`, `wayfinder:grilling`, `wayfinder:task`.
- **Frontier** (open + unblocked + unassigned): `gh issue list --state open --label wayfinder:research,wayfinder:prototype,wayfinder:grilling,wayfinder:task --json number,title,body,assignees` then read each `## Blocked by` section.
