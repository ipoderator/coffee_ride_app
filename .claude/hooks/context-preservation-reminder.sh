#!/bin/bash
CHANGED=$(git status --porcelain -- apps packages 2>/dev/null | grep -v '^??' | wc -l | tr -d ' ')
if [ "$CHANGED" -gt 0 ]; then
  CTX_CHANGED=$(git status --porcelain -- .claude/context docs/changelog.md docs/tasks.md 2>/dev/null | wc -l | tr -d ' ')
  if [ "$CTX_CHANGED" -eq 0 ]; then
    echo '{"systemMessage": "Reminder: apps/packages have uncommitted changes, but .claude/context, docs/changelog.md and docs/tasks.md do not. Update project state before compacting/stopping (CLAUDE.md Context preservation protocol)."}'
  fi
fi
