#!/bin/bash

# Script to fix line endings in .env files that may have Windows-style line endings

find ../ -name ".env*" -type f -exec bash -c '
  for file do
    if file --mime-type "$file" | grep -q "charset=unknown"; then
      echo "Fixing line endings in $file"
      # Remove carriage returns and replace with proper line endings
      sed -i $'"'"'s/\r$//' "$file"
    fi
  done
' bash {} +

echo "Line ending fixes applied to all .env files"
