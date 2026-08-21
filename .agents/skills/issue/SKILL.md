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

> **PowerShell 编码铁律**：`--body "..."` / `--title "..."` 里的中文/UTF-8 若经 PowerShell 变量或管道中转，会被按 GBK 双重转码破坏成 mojibake 且不可逆。**一律先把 body/title 写入 UTF-8 文件，再用 `--body-file` / `--title-file` 传入**；读回 issue body 用 `node` 字节级处理（`execFileSync('gh', [...], {encoding:'buffer'})` + `buf.toString('utf8')`），不经 PowerShell 变量。
