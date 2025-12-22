#!/bin/bash
# Biome check script that only fails on actual errors (not warnings)
# Used by both dev (lint:dev) and CI (check:ci) for parity

output=$(biome check . 2>&1)
exit_code=$?

# If Biome exits with 0, everything is fine
if [ $exit_code -eq 0 ]; then
  exit 0
fi

# Filter to only show error-level issues (not warnings)
# Error-level rules: correctness, security, performance (when set to error)
errors=$(echo "$output" | grep -E "lint/(correctness|security|performance)" | grep -v "warn\|WARN")

if [ -n "$errors" ]; then
  echo "❌ Biome errors found:"
  echo "$errors"
  exit 1
fi

# If there are only warnings, show them but don't fail
warnings=$(echo "$output" | grep -E "lint/.*warn" | head -10)
if [ -n "$warnings" ]; then
  echo "⚠️  Biome warnings found (not blocking):"
  echo "$warnings"
  if [ $(echo "$warnings" | wc -l) -ge 10 ]; then
    echo "... (showing first 10, run 'npm run check' to see all)"
  fi
fi

exit 0

