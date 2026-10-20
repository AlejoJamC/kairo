import json
import os
import re
import subprocess
import sys

# PostToolUse: lint the file that was just written and block on new violations.
# Violations that predate a rule live in eslint-suppressions.json, so only code
# that adds to them fails here.

payload = json.load(sys.stdin)
path = (payload.get("tool_response") or {}).get("filePath") or (payload.get("tool_input") or {}).get("file_path") or ""

PROJECTS = [("apps/dashboard", re.compile(r"/apps/dashboard/src/.+\.(ts|tsx)$"))]

for project, pattern in PROJECTS:
    if not pattern.search(path):
        continue
    root = os.environ.get("CLAUDE_PROJECT_DIR") or os.getcwd()
    cwd = os.path.join(root, project)
    try:
        result = subprocess.run(
            ["bunx", "eslint", "--no-warn-ignored", path],
            cwd=cwd,
            capture_output=True,
            text=True,
            timeout=90,
        )
    except (OSError, subprocess.TimeoutExpired):
        raise SystemExit
    if result.returncode == 0:
        raise SystemExit
    report = "\n".join((result.stdout or result.stderr).strip().splitlines()[:40])
    print(json.dumps({
        "decision": "block",
        "reason": "ESLint found violations in the file you just wrote. Fix them before continuing "
                  "(compose @kairo/ui primitives; no inline style, no color literals, no direct fetch or Supabase):\n" + report,
    }))
    raise SystemExit
