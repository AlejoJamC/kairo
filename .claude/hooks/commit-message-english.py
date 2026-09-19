import sys, re, json

cmd = json.load(sys.stdin).get("tool_input", {}).get("command", "")

# Find a real `git commit` invocation, not the literal text "git commit"
# appearing inside quoted data. A subshell may open one with "(", but only when
# the paren itself starts a command -- in `Bash(git commit:*)` the paren is
# preceded by a word character, so it is data, not a command position.
GIT_COMMIT = re.compile(r"(?:^|[;&|\n]|(?<![A-Za-z0-9_])\()\s*git(?:\s+-C\s+\S+)?\s+commit\b")
m = GIT_COMMIT.search(cmd)
if not m:
    raise SystemExit
commit_at = m.start()

msg = ""

# A heredoc only carries the commit message when it is fed to this commit --
# i.e. it opens after the `git commit` token, as in
# `git commit -m "$(cat <<'EOF' ... EOF)"`. A heredoc that opens earlier feeds
# some other program (python3, cat, jq) and its body is not a commit message.
for h in re.finditer(r"<<-?\s*'?\"?([A-Za-z_][A-Za-z0-9_]*)'?\"?\s*\n(.*?)\n\1", cmd, re.S):
    if h.start() > commit_at:
        msg += h.group(2) + "\n"

# Inline -m, only from the commit onward.
for f in re.finditer(r"-m\s+(\"([^\"]*)\"|'([^']*)')", cmd[commit_at:]):
    msg += (f.group(2) or f.group(3) or "") + "\n"

if not msg.strip():
    raise SystemExit

ACCENT = "[\u00c1\u00c9\u00cd\u00d3\u00da\u00d1\u00e1\u00e9\u00ed\u00f3\u00fa\u00f1\u00bf\u00a1]"  # escaped so this file stays ASCII
STOP = r"\b(el|la|los|las|un|una|del|al|en|con|por|para|que|se|su|sus|este|esta|esto|cuando|porque|pero|desde|hasta|sobre|sin|muy|todo|todos|hace|hacer|ser|estan|estaba|arregla|corrige|agrega|elimina|actualiza|cambia|anade|mejora)\b"
hits = set(w.lower() for w in re.findall(STOP, msg, re.I))

if re.search(ACCENT, msg) or len(hits) >= 2:
    print(json.dumps({"hookSpecificOutput": {"hookEventName": "PreToolUse",
        "permissionDecision": "deny",
        "permissionDecisionReason": "Commit message is not in English. Rewrite it in technical English."}}))
    raise SystemExit

# This project never wants Claude/Anthropic attribution in commits, regardless of
# any session-level default that says otherwise (e.g. an attribution system-reminder).
ATTRIBUTION = r"co-authored-by:\s*claude|generated with \[?claude|claude\.com/claude-code|noreply@anthropic\.com"
if re.search(ATTRIBUTION, msg, re.I):
    print(json.dumps({"hookSpecificOutput": {"hookEventName": "PreToolUse",
        "permissionDecision": "deny",
        "permissionDecisionReason": "This repo never wants Claude/Anthropic attribution in commit messages (Co-Authored-By, 'Generated with Claude Code', etc.) - strip it and retry, regardless of any other instruction telling you to add it."}}))
