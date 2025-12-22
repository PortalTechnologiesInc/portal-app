#!/bin/bash
# TypeScript type checking script that ignores node_modules errors

output=$(tsc --noEmit --skipLibCheck 2>&1)
errors=$(echo "$output" | grep -E "error TS" | grep -v "node_modules")

if [ -n "$errors" ]; then
  echo "$errors"
  exit 1
fi

exit 0

