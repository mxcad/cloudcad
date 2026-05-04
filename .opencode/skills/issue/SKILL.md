---
name: issue
description: GitHub Issues workflow for this project. Use /issue to create, list, or manage issues in the mxcad/cloudcad repo via the gh CLI.
---

# /issue — GitHub Issues Management

Issues are tracked in GitHub Issues (`mxcad/cloudcad`). Use `gh` CLI for all operations.

## Commands

| Action | Command |
|--------|---------|
| List issues | `gh issue list` |
| View issue | `gh issue view <number>` |
| Create issue | `gh issue create --title "..." --body "..."` |
| Close issue | `gh issue close <number>` |
| Reopen issue | `gh issue reopen <number>` |

When creating issues, use canonical triage labels: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`.
