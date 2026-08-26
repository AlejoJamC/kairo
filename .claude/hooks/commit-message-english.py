import sys, re, json
cmd = json.load(sys.stdin).get("tool_input", {}).get("command", "")
if not re.search(r"(^|[;&|()])\s*git(\s+-C\s+\S+)?\s+commit\b", cmd):
    raise SystemExit
msg = ""
for m in re.finditer(r"<<-?\s*'?\"?([A-Za-z_][A-Za-z0-9_]*)'?\"?\s*\n(.*?)\n\1", cmd, re.S):
    msg += m.group(2) + "\n"
for m in re.finditer(r"-m\s+(\"([^\"]*)\"|'([^']*)')", cmd):
    msg += (m.group(2) or m.group(3) or "") + "\n"
if not msg.strip():
    raise SystemExit
ACCENT = "[\u00c1\u00c9\u00cd\u00d3\u00da\u00d1\u00e1\u00e9\u00ed\u00f3\u00fa\u00f1\u00bf\u00a1]"  # escaped so this file stays ASCII
STOP = r"\b(el|la|los|las|un|una|del|al|en|con|por|para|que|se|su|sus|este|esta|esto|cuando|porque|pero|desde|hasta|sobre|sin|muy|todo|todos|hace|hacer|ser|estan|estaba|arregla|corrige|agrega|elimina|actualiza|cambia|anade|mejora)\b"
hits = set(w.lower() for w in re.findall(STOP, msg, re.I))
if re.search(ACCENT, msg) or len(hits) >= 2:
    print(json.dumps({"hookSpecificOutput": {"hookEventName": "PreToolUse",
        "permissionDecision": "deny",
        "permissionDecisionReason": "Commit message is not in English. Rewrite it in technical English."}}))
