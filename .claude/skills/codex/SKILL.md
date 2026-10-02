---
name: codex
description: "Plan-and-review workflow where Claude plans and reviews while the Codex CLI writes the code. Use only when the user invokes /codex with a task or plan file (e.g. `/codex implement PLAN.md`)."
disable-model-invocation: true
---

# Codex Implementation Workflow

You plan and review; Codex writes the code. Task: $ARGUMENTS

## Rules

- Do not write application code yourself. Every code change goes through Codex.
- Requires the `codex` CLI to be installed and logged in (`codex --version`, `codex login`). If it is missing, stop and tell the user.
- Keep Codex's scratch files in `storage/logs/` (git-ignored). Never leave them in the repo root.

## 1. Plan

1. Read the task (or the plan file it names) and the code it touches, including `.ai/rules` files that cover those paths.
2. If the code already differs from the plan, list the differences and ask before sending anything to Codex.
3. Split the work into small, independently testable steps (one migration, one controller, one page, its tests).
4. Show the user the step list and wait for approval before running Codex.

## 2. Run each step

1. Write a precise instruction to `storage/logs/codex-task.md`: the exact files, the behavior, the conventions to follow, the tests to add, and what *not* to touch. Point Codex at sibling files to copy from.
2. Run Codex with stdin, so quotes in the instruction never break the shell, and a 10-minute Bash timeout:

```bash
codex exec --sandbox workspace-write -o storage/logs/codex-last.txt - < storage/logs/codex-task.md
```

## 3. Review each step

1. Read `storage/logs/codex-last.txt` and `git diff`. Check the diff against the instruction: scope, conventions, no unrelated edits.
2. Run the narrowest tests that cover the step (`php artisan test --compact <file>`) and `vendor/bin/pint --dirty --format agent`.
3. If anything is wrong, write the fix instruction to `storage/logs/codex-task.md` and resume the same Codex session:

```bash
codex exec resume --last -o storage/logs/codex-last.txt - < storage/logs/codex-task.md
```

4. Move to the next step only when the current one passes review and tests. If a test exposes a real bug or a design question, bring it to the user before sending a fix to Codex.

## 4. Finish

Run the full suite (`php artisan test --compact`) and `npm run build` when frontend files changed. Report what each step changed and the test results. Do not commit unless the user asks.
