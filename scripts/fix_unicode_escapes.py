"""One-shot: convert \\uXXXX escape sequences to actual UTF-8 characters.

JSX children text does not interpret JS escape sequences, so \\u9332 renders
literally. Converting all \\uXXXX to the real character is safe because:
- In JS string literals it had the same runtime meaning
- In JSX text it now actually displays correctly

Usage:
    python scripts/fix_unicode_escapes.py
"""
import re
import sys
from pathlib import Path

FILES = [
    "src/components/AIScriptGenerator.tsx",
    "src/components/Layout.tsx",
    "src/lib/aiScript.ts",
    "src/lib/scriptsApi.ts",
    "src/routes/Home.tsx",
    "src/routes/Library.tsx",
    "src/routes/ScriptEditor.tsx",
    "src/types/index.ts",
]

ROOT = Path(__file__).resolve().parent.parent

# Match literal backslash + u + 4 hex digits
PATTERN = re.compile(r"\\u([0-9a-fA-F]{4})")


def convert(match: re.Match) -> str:
    return chr(int(match.group(1), 16))


def main() -> int:
    any_changes = False
    for rel in FILES:
        p = ROOT / rel
        text = p.read_text(encoding="utf-8")
        new = PATTERN.sub(convert, text)
        if new != text:
            count = len(PATTERN.findall(text))
            p.write_text(new, encoding="utf-8")
            print(f"{rel}: converted {count} escape(s)")
            any_changes = True
        else:
            print(f"{rel}: no change")
    return 0 if any_changes else 1


if __name__ == "__main__":
    sys.exit(main())
