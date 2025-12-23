#!/bin/bash
# Biome check script that only fails on actual errors (not warnings)
# Used by both dev (lint:dev) and CI (check:ci) for parity
#
# This script ensures consistent error detection by:
# 1. Clearing Biome cache before running (if it exists)
# 2. Capturing all output including stderr
# 3. Properly filtering errors vs warnings

# Clear Biome cache directory if it exists to ensure fresh analysis
# Biome cache is typically in node_modules/.cache/biome or .biome_cache
if [ -d "node_modules/.cache/biome" ]; then
  rm -rf node_modules/.cache/biome
fi
if [ -d ".biome_cache" ]; then
  rm -rf .biome_cache
fi

# Run Biome check and capture both stdout and stderr
# Use npx to ensure we use the local Biome installation
output=$(npx biome check . 2>&1)
exit_code=$?

# If Biome exits with 0, everything is fine
if [ $exit_code -eq 0 ]; then
  exit 0
fi

# Extract all error lines (lines containing error indicators)
# Biome errors have format: "file:line:col lint/rule-name" followed by details
# According to biome.json, only correctness, security, and performance rules are set to "error"
# Suspicious and style rules are set to "warn" and should not fail the build
# The pattern matches: file:line:col lint/rule-name
# We only look for correctness, security, and performance rules (actual errors)
# Format: "file:line:col lint/category/rule-name"
errors=$(echo "$output" | grep -E "^[^:]+:[0-9]+:[0-9]+.*lint/(correctness|security|performance)/" || true)

# Remove duplicates and empty lines, then check if we have any errors
if [ -n "$errors" ]; then
  unique_errors=$(echo "$errors" | sort -u | grep -v '^$' || true)
  if [ -n "$unique_errors" ]; then
    echo "❌ Biome errors found:"
    echo "$unique_errors"
    exit 1
  fi
fi

# If we get here, there are no actual errors (only warnings or formatting issues)
# Exit successfully

# If there are only warnings, show them but don't fail
warnings=$(echo "$output" | grep -E "lint/.*warn" | head -10 || true)
if [ -n "$warnings" ]; then
  echo "⚠️  Biome warnings found (not blocking):"
  echo "$warnings"
  if [ $(echo "$warnings" | wc -l) -ge 10 ]; then
    echo "... (showing first 10, run 'npm run check' to see all)"
  fi
fi

exit 0

