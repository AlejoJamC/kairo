"""Gate git history writes on an explicit, unspent instruction.

A permissions allow-rule grants a command pattern forever, so "the user said
commit once" silently becomes "may commit at will" for the rest of the
session. That is the failure this hook exists to stop.

The rule is a QUOTA, not a grammar check. Asking how the sentence was built --
does it carry an imperative verb, is the verb elided, is it a mention or an
order -- answers the wrong question and gets it wrong both ways. What matters
is the count:

  * The word appears in the last message the human typed -> ONE history write
    of that kind is authorised.
  * The message states a number ("2 commits", "haga 3 commits") -> that many.
  * The word does not appear -> zero. Finishing work authorises nothing.

Once the count is spent, every further attempt fails -- now and for the rest
of the session -- until the user asks again. One instruction can never become
a standing licence.

`commit` and `push` carry separate quotas, so "commit y push" authorises one
of each and nothing more.

Tradeoff, accepted deliberately: a message that merely discusses committing
now authorises one. That is the price of dropping the grammar check, and it is
cheap -- the damage this guards against is not one unwanted commit, it is a
hundred of them off a single word.
"""
import sys, json, re

HISTORY_WRITE = re.compile(
    r"(?:^|[;&|\n]|(?<![A-Za-z0-9_])\()\s*git(?:\s+-C\s+\S+)?\s+(commit|push)\b"
)

# Any spelling of the word is the ask -- commit, commitear, comitea, commiteo.
MENTION = {
    # `git commit --amend` IS a commit -- HISTORY_WRITE already counts it as
    # one -- so asking for "an amend" has to authorise one too. Without this
    # the hook recognises the command but not the order for it.
    "commit": re.compile(r"\b(commit\w*|comit\w*|amend\w*|enmend\w*|enmien\w*)\b", re.I),
    "push":   re.compile(r"\b(push\w*|pushe\w*)\b",   re.I),
}

WORD_NUMBERS = {
    "un": 1, "una": 1, "uno": 1, "one": 1, "single": 1,
    "dos": 2, "two": 2, "tres": 3, "three": 3,
    "cuatro": 4, "four": 4, "cinco": 5, "five": 5,
}

# A stated count sits immediately before the word. Anything further away is
# some other number in the sentence, not a quota.
COUNT_WINDOW = 3

# An implausible count is a number that happened to be nearby (a ticket id, a
# file count), not a quota. Fall back to one.
MAX_COUNT = 50


# Text the user is quoting back -- fenced blocks, and long double-quoted
# passages -- is evidence in an argument, not an order. This conversation is
# full of the user pasting an earlier reply to criticise it, and those pastes
# contain the word.
FENCE = re.compile(r"```.*?```", re.S)
BLOCKQ = re.compile(r'^"\s*$.*?^"\s*$', re.S | re.M)
INLINEQ = re.compile(r'"[^"\n]*"')


def own_words(text):
    """Drop material the user is quoting rather than saying."""
    return INLINEQ.sub(" ", BLOCKQ.sub(" ", FENCE.sub(" ", text)))


def quota(text, verb):
    """How many `git <verb>` this message authorises. 0 means it did not ask."""
    found = MENTION[verb].search(text)
    if not found:
        return 0
    lead = re.findall(r"[a-z0-9]+", text[:found.start()].lower())[-COUNT_WINDOW:]
    for token in reversed(lead):
        if token.isdigit():
            count = int(token)
            return count if 0 < count <= MAX_COUNT else 1
        if token in WORD_NUMBERS:
            return WORD_NUMBERS[token]
    return 1


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


def spent(entries, verb):
    """History writes of this kind attempted since the instruction.

    Attempted, not executed: a call that was refused still spends the quota.
    The safe failure here is to make the user say it again.
    """
    used = 0
    for entry in entries:
        if entry.get("type") != "assistant":
            continue
        content = entry.get("message", {}).get("content")
        if not isinstance(content, list):
            continue
        for block in content:
            if not isinstance(block, dict) or block.get("type") != "tool_use":
                continue
            if block.get("name") != "Bash":
                continue
            command = block.get("input", {}).get("command", "")
            used += sum(1 for m in HISTORY_WRITE.finditer(command) if m.group(1) == verb)
    return used


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

allowed = quota(own_words(human_text(entries[last_human])), verb)
if allowed == 0:
    blocked(
        "No git {0} was asked for. The last thing the user typed does not "
        "mention one, and finishing work is not an instruction to {0}. Report "
        "what changed and wait for the explicit order.".format(verb)
    )

used = spent(entries[last_human + 1:], verb)
if used >= allowed:
    blocked(
        "Quota spent. The user's last message authorised {0} git {1}(s); {2} "
        "have already been attempted since. It does not authorise another one "
        "-- not now, not later in this session. Stop and ask before running "
        "any further git {1}.".format(allowed, verb, used)
    )
