#!/usr/bin/env python3
import sys
import re

def strip_timestamps(text: str) -> str:
    # Match M:SS (seconds always 2 digits) optionally followed by a
    # duration count + unit (seconds, minutes, or "minute(s), N seconds")
    pattern = re.compile(
        r'^\d+:\d{2}(?:\d+\s*(?:minutes?,\s*\d+\s*seconds?|minutes?|seconds?))?'
    )
    lines = text.splitlines(keepends=True)
    stripped = [pattern.sub('', line) for line in lines]
    return ''.join(stripped)

def main():
    if len(sys.argv) < 2:
        print("Usage: python strip_timestamps.py <source> [output]", file=sys.stderr)
        sys.exit(1)

    source = sys.argv[1]
    output = sys.argv[2] if len(sys.argv) > 2 else source + ".clean"

    with open(source, 'r') as f:
        text = f.read()

    cleaned = strip_timestamps(text)

    with open(output, 'w') as f:
        f.write(cleaned)

    print(f"Cleaned: {source} -> {output}")

if __name__ == '__main__':
    main()
