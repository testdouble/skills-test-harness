#!/usr/bin/env bash
# Validate a test suite directory the way the harness will before a run.
#
# Usage: validate-suite.sh {suite-dir}
#
# Emits structured key: value pairs on stdout and always exits 0 so the skill
# can read the findings and fix them rather than crash on a violation.
#
# Output keys:
#   status            one of: ok | violations | error
#   reason            (only when status=error) explanation for the operator
#   suite-dir         the directory that was checked
#   tests             number of test entries in tests.json
#   by-type           space-separated `{type}={count}` pairs
#   errors            count of findings
#   findings-start / findings-end
#                     wrap one finding per line: `error {test-name-or-file} {message}`
#   findings: none    when nothing was found
#
# Checks (mirroring the harness's own load-time validation):
#   tests.json parses; top-level `plugins` is a non-empty array; `tests` is an array
#   every test has name, type (skill-prompt|skill-call|agent-call|agent-prompt),
#     promptFile, and a non-empty expect array
#   every promptFile exists under prompts/ and is non-empty
#   every scaffold names an existing directory under scaffolds/
#   every llm-judge rubricFile exists under rubrics/ and holds at least one criterion
#   skill-call tests have skillFile; agent-prompt tests have agentFile
#   a simplified `{ "skill-call": bool }` needs skillFile; `{ "agent-call": bool }` needs agentFile
#   skillFile / agentFile values are in plugin:name form
#   promptFile names are unique across the suite

DIR="${1%/}"

if [ -z "$DIR" ]; then
  echo "status: error"; echo "reason: usage: validate-suite.sh {suite-dir}"; exit 0
fi
if [ ! -d "$DIR" ]; then
  echo "status: error"; echo "reason: $DIR is not a directory"; exit 0
fi
if [ ! -f "$DIR/tests.json" ]; then
  echo "status: error"; echo "reason: $DIR/tests.json does not exist"; exit 0
fi
if ! command -v python3 >/dev/null 2>&1; then
  echo "status: error"; echo "reason: python3 is required to parse tests.json"; exit 0
fi

echo "suite-dir: $DIR"

python3 - "$DIR" <<'PY'
import json, os, re, sys, collections

d = sys.argv[1]
findings = []
def err(where, msg): findings.append(f"error {where} {msg}")

try:
    cfg = json.load(open(os.path.join(d, "tests.json")))
except Exception as e:
    print("tests: 0"); print("by-type: none"); print("errors: 1")
    print("findings-start"); print(f"error tests.json does not parse: {e}"); print("findings-end")
    print("status: violations"); sys.exit(0)

VALID_TYPES = {"skill-prompt", "skill-call", "agent-call", "agent-prompt"}
IDENT = re.compile(r"^[a-z0-9-]+:[a-z0-9-]+$")

plugins = cfg.get("plugins")
if not isinstance(plugins, list) or not plugins:
    err("tests.json", "top-level plugins must be a non-empty array")
tests = cfg.get("tests")
if not isinstance(tests, list):
    err("tests.json", "top-level tests must be an array"); tests = []

by_type = collections.Counter()
prompt_uses = collections.Counter()

for i, t in enumerate(tests):
    name = t.get("name") or f"tests[{i}]"
    if not t.get("name"): err(name, "missing name")
    ttype = t.get("type")
    if ttype not in VALID_TYPES:
        err(name, f"type must be one of {sorted(VALID_TYPES)}, got {ttype!r}")
    else:
        by_type[ttype] += 1
    pf = t.get("promptFile")
    if not pf:
        err(name, "missing promptFile")
    else:
        prompt_uses[pf] += 1
        p = os.path.join(d, "prompts", pf)
        if not os.path.isfile(p): err(name, f"promptFile prompts/{pf} does not exist")
        elif os.path.getsize(p) == 0: err(name, f"promptFile prompts/{pf} is empty")
    sc = t.get("scaffold")
    if sc and not os.path.isdir(os.path.join(d, "scaffolds", sc)):
        err(name, f"scaffold scaffolds/{sc}/ does not exist")
    if ttype == "skill-call" and not t.get("skillFile"): err(name, "skill-call test requires skillFile")
    if ttype == "agent-prompt" and not t.get("agentFile"): err(name, "agent-prompt test requires agentFile")
    for key in ("skillFile", "agentFile"):
        v = t.get(key)
        if v and not IDENT.match(v): err(name, f"{key} must be plugin:name in kebab-case, got {v!r}")
    exp = t.get("expect")
    if not isinstance(exp, list) or not exp:
        err(name, "expect must be a non-empty array"); continue
    for e in exp:
        if not isinstance(e, dict) or len(e) != 1:
            err(name, "each expect entry must be an object with exactly one key"); continue
        k, v = next(iter(e.items()))
        if k in ("result-contains", "result-does-not-contain"):
            if not isinstance(v, str) or not v: err(name, f"{k} must be a non-empty string")
        elif k in ("skill-call", "agent-call"):
            field = "skillFile" if k == "skill-call" else "agentFile"
            if isinstance(v, bool):
                if not t.get(field): err(name, f"simplified {k} expectation requires test.{field}")
            elif isinstance(v, dict):
                ident = v.get("skill" if k == "skill-call" else "agent")
                if not isinstance(ident, str) or not IDENT.match(ident or ""):
                    err(name, f"{k} object needs a plugin:name identifier")
                if not isinstance(v.get("expected"), bool): err(name, f"{k} object needs boolean expected")
            else:
                err(name, f"{k} must be a boolean or an object")
        elif k == "llm-judge":
            rf = v.get("rubricFile") if isinstance(v, dict) else None
            if not rf: err(name, "llm-judge requires rubricFile")
            else:
                rp = os.path.join(d, "rubrics", rf)
                if not os.path.isfile(rp): err(name, f"rubricFile rubrics/{rf} does not exist")
                elif not any(l.lstrip().startswith("- ") for l in open(rp)):
                    err(name, f"rubricFile rubrics/{rf} has no bullet criteria")
            if isinstance(v, dict):
                th = v.get("threshold")
                if th is not None and not (isinstance(th, (int, float)) and 0 <= th <= 1):
                    err(name, "llm-judge threshold must be between 0 and 1")
        else:
            err(name, f"unknown expectation type {k!r}")

for pf, n in prompt_uses.items():
    if n > 1: err(f"prompts/{pf}", f"promptFile is used by {n} tests; each test should own its prompt")

print(f"tests: {len(tests)}")
print("by-type:" + ("".join(f" {k}={v}" for k, v in sorted(by_type.items())) or " none"))
print(f"errors: {len(findings)}")
if findings:
    print("findings-start"); print("\n".join(findings)); print("findings-end")
else:
    print("findings: none")
print("status: violations" if findings else "status: ok")
PY
exit 0
