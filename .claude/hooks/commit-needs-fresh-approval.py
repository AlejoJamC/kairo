"""Gate git history writes on an explicit, unspent instruction.

A permissions allow-rule grants a command pattern forever, so "the user said
commit once" silently becomes "may commit at will". This hook closes that by
reading the session transcript and answering two questions the permission
system cannot:

  1. Does the LAST message the human actually typed ask for this?
  2. Has that instruction already been spent on an earlier commit?

One instruction authorises one commit. Wanting a second one is fine -- it just
needs to be asked for again, which resets the count.
"""
import sys, json, re

HISTORY_WRITE = re.compile(
    r"(?:^|[;&|\n]|(?<![A-Za-z0-9_])\()\s*git(?:\s+-C\s+\S+)?\s+(commit|push)\b"
)

# An order to commit, not a mention of one. The discriminator is an imperative
# "do it" verb governing the word: "haga un commit" is an instruction,
# "quien le dio permiso de comitear" and "que bloquee git commit" are not.
# Verb stems are loose because the instruction is often typed fast ("hagag").
INSTRUCTION = re.compile(
    r"\b(hag\w{0,5}|haz\w{0,3}|realic\w+|realiz\w+|ejecut\w+|corr[ae]|proced\w+|"
    r"dale|apliqu\w+|aplic\w+)\b[^.;\n]{0,24}?\b(commit\w*|comit\w*|push\w*)\b"
    r"|^\s*(commit|push|commitea|comitea|pushea)\b"
    r"|\b(commit\w*|comit\w*)\s+(and|y)\s+push\b"
    r"|\b(suba|sube|subelo|pushee|pushea)\b",
    re.I | re.M,
)


# Text the user is quoting back -- fenced blocks, and long double-quoted
# passages -- is evidence in an argument, not an order. This conversation is
# full of the user pasting an earlier reply to criticise it, and those pastes
# contain phrases like "haga un commit".
FENCE = re.compile(r"```.*?```", re.S)
BLOCKQ = re.compile(r'^"\s*$.*?^"\s*$', re.S | re.M)
INLINEQ = re.compile(r'"[^"\n]*"')


def own_words(text):
    """Drop material the user is quoting rather than saying.

    This conversation is largely the user pasting an earlier reply back to
    argue with it, and those pastes contain the very phrases that authorise a
    commit. A fenced block, a passage fenced by a lone double-quote line, and
    a short quoted phrase are all citations, not orders.
    """
    return INLINEQ.sub(" ", BLOCKQ.sub(" ", FENCE.sub(" ", text)))


def blocked(reason):
    print(json.dumps({"hookSpecificOutput": {
        "hookEventName": "PreToolUse",
        "permissionDecision": "deny",
        "permissionDecisionReason": reason,
    }}))
    raise SystemExit


def is_human_turn(entry):
    """A typed message, not a tool result and not injected metadata."""
    if entry.get("type") != "user" or entry.get("isMeta"):
        return False
    content = entry.get("message", {}).get("content")
    if isinstance(content, str):
        return bool(content.strip())
    if isinstance(content, list):
        kinds = {b.get("type") for b in content if isinstance(b, dict)}
        return "tool_result" not in kinds and "text" in kinds
    return False


def human_text(entry):
    content = entry.get("message", {}).get("content")
    if isinstance(content, str):
        return content
    return " ".join(
        b.get("text", "") for b in content if isinstance(b, dict) and b.get("type") == "text"
    )


def counts_as_history_write(entry):
    """An assistant turn that ran git commit/push via Bash."""
    if entry.get("type") != "assistant":
        return False
    content = entry.get("message", {}).get("content")
    if not isinstance(content, list):
        return False
    for b in content:
        if not isinstance(b, dict) or b.get("type") != "tool_use":
            continue
        if b.get("name") != "Bash":
            continue
        if HISTORY_WRITE.search(b.get("input", {}).get("command", "")):
            return True
    return False


payload = json.load(sys.stdin)
command = payload.get("tool_input", {}).get("command", "")
match = HISTORY_WRITE.search(command)
if not match:
    raise SystemExit
verb = match.group(1)

transcript = payload.get("transcript_path", "")
if not transcript:
    raise SystemExit  # cannot verify; leave it to the permission prompt

try:
    entries = []
    with open(transcript, encoding="utf-8", errors="ignore") as fh:
        for line in fh:
            try:
                entries.append(json.loads(line))
            except ValueError:
                continue
except OSError:
    raise SystemExit

last_human = None
for i in range(len(entries) - 1, -1, -1):
    if is_human_turn(entries[i]):
        last_human = i
        break

if last_human is None:
    raise SystemExit

instruction = human_text(entries[last_human])
if not INSTRUCTION.search(own_words(instruction)):
    blocked(
        "No commit or push was asked for. The last thing the user typed does "
        "not mention one, and finishing work is not an instruction to commit. "
        "Report what changed and wait for the explicit order."
    )

already = sum(1 for e in entries[last_human + 1:] if counts_as_history_write(e))
if already:
    blocked(
        "That instruction has already been used: {} git commit/push command(s) "
        "ran since the user's last message. One instruction authorises one. "
        "Ask before running another `git {}`.".format(already, verb)
    )
