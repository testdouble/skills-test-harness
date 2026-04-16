# Plan: Fix Docker Runtime Environment (Theme 1)

## Context

Test run `20260323T115532` had 5 prompt-test failures (5-9) from the same root cause: the Docker container mounts `/workspace` as read-only with no git repo. Models detect these constraints and bypass skills — even with explicit `/slash-command` prompts. The skill-call type tests all pass, confirming skills work fine when invoked directly.

Fixing this requires: (1) a writable workspace, (2) a git repo, and (3) realistic project content for skills that need something to scan/review/document.

The mount change from `/workspace:ro` to `/test-suite:ro` also affects currently-passing suites that reference `fixtures/` paths, so all fixture-bearing suites must be migrated.

## Design Decisions

- **Writable workspace:** Docker anonymous volume for `/workspace`
- **Entrypoint wrapper:** POSIX sh script: copies scaffold into `/workspace`, git init + commit, then `exec claude "$@"`
- **Suite-provided scaffolds:** Each test suite owns its scaffolds in `tests/test-suites/{suite}/scaffolds/{name}/`. No auto-generated language scaffolds — test authors control the full project structure
- **Per-test scaffold config:** `"scaffold": "ruby-project"` field on each test case in tests.json. Optional — tests without it get only a writable workspace (no git)
- **Git init only with scaffold:** Only tests that specify a scaffold get git init + commit
- **Fixtures merged into scaffolds:** The `fixtures/` directory is eliminated. All project files live in `scaffolds/{name}/`, maintaining whatever directory structure the test author wants
- **Both runners updated:** Prompt and skill-call runners both use the new mount strategy
- **Docker files location:** `tests/packages/docker/` (Dockerfile + entrypoint.sh)
- **Build context simplification:** `step-5-docker-build.ts` uses `tests/packages/docker/` directly as build context instead of tmpdir + text imports
- **Env var:** `-e SCAFFOLD_NAME=ruby-project` passed per `docker run`
- **Validation:** At config parse time, verify that `scaffolds/{name}/` exists on disk for every test that specifies a scaffold. Fail fast before Docker runs

---

## Changes

### 1. Move Dockerfile, create entrypoint — `tests/packages/docker/`

**Move** `tests/packages/Dockerfile` → `tests/packages/docker/Dockerfile`

Updated Dockerfile:
```dockerfile
FROM node:20-slim
ARG CLAUDE_CODE_VERSION=latest
RUN apt-get update && apt-get install -y --no-install-recommends git \
    && rm -rf /var/lib/apt/lists/*
RUN npm install -g @anthropic-ai/claude-code@${CLAUDE_CODE_VERSION}
COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh
USER node
WORKDIR /workspace
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
```

**Create** `tests/packages/docker/entrypoint.sh`:
```sh
#!/bin/sh
set -e

# Copy scaffold into writable /workspace if specified
if [ -n "$SCAFFOLD_NAME" ] && [ -d "/test-suite/scaffolds/$SCAFFOLD_NAME" ]; then
  cp -r "/test-suite/scaffolds/$SCAFFOLD_NAME/." /workspace/

  # Initialize git repo and commit
  cd /workspace
  git init
  git config user.email "test@test.com"
  git config user.name "Test"
  git add -A
  git commit -m "Initial commit" --allow-empty
fi

exec claude "$@"
```

### 2. Simplify `step-5-docker-build.ts`

**File:** `tests/packages/cli/src/test-runners/steps/step-5-docker-build.ts`

Remove: tmpdir creation, text import of Dockerfile, file writes, tmpdir cleanup.
Replace with: `docker build --build-arg CLAUDE_CODE_VERSION=... -t {image} {dockerDir}` where `dockerDir` is the absolute path to `tests/packages/docker/`.

Add `dockerDir` to `tests/packages/cli/src/paths.ts`:
```ts
export const dockerDir = path.join(harnessDir, 'docker')
```

### 3. Add `scaffold` to `TestCase` type

**File:** `tests/packages/data/src/types.ts`

```ts
export interface TestCase {
  name:       string
  type?:      string
  promptFile: string
  skillFile?: string
  model?:     string
  scaffold?:  string    // NEW — name of scaffolds/{name}/ directory
  expect:     TestExpectation[]
}
```

### 4. Add scaffold validation to config parsing

**File:** `tests/packages/data/src/config.ts`

Add a validation function (called from step-2 or step-3):
```ts
export function validateScaffolds(testSuiteDir: string, config: TestSuiteConfig): void {
  for (const test of config.tests) {
    if (test.scaffold) {
      const scaffoldPath = path.join(testSuiteDir, 'scaffolds', test.scaffold)
      if (!existsSync(scaffoldPath)) {
        throw new Error(`Scaffold directory not found: ${scaffoldPath} (test "${test.name}")`)
      }
    }
  }
}
```

### 5. Pass SCAFFOLD_NAME per docker run

**Files:** Both `tests/packages/cli/src/test-runners/prompt/index.ts` and `skill-call/index.ts`

In the per-test loop, before building `runArgs`, add scaffold env var:
```ts
const scaffoldFlags = test.scaffold ? ['-e', `SCAFFOLD_NAME=${test.scaffold}`] : []
```

Then include `...scaffoldFlags` in `runArgs`.

### 6. Change mount strategy in both runners

**File:** `tests/packages/cli/src/test-runners/prompt/index.ts` (line 76)

Change:
```ts
'-v', `${testSuiteDir}:/workspace:ro`,
```
To:
```ts
'-v', `${testSuiteDir}:/test-suite:ro`,
```

**File:** `tests/packages/cli/src/test-runners/skill-call/index.ts` (line 80)

Same change.

### 7. Create scaffold directories and migrate fixtures

For each suite with existing fixtures, create a `scaffolds/` directory, move fixture content into it with proper project structure, then delete the `fixtures/` directory.

**code-review** — scaffold: `ruby-project`
```
scaffolds/ruby-project/
  Gemfile
  lib/
    example.rb          ← content from current fixtures/example.rb
```

**coding-standard** — scaffold: `ruby-project`
```
scaffolds/ruby-project/
  Gemfile
  lib/
    example.rb          ← content from current fixtures/example.rb
```

**investigate** — scaffold: `ruby-project`
```
scaffolds/ruby-project/
  Gemfile
  lib/
    example.rb          ← content from current fixtures/example.rb
```

**test-planning** — scaffold: `ruby-project`
```
scaffolds/ruby-project/
  Gemfile
  lib/
    example.rb          ← content from current fixtures/example.rb
```

**iterative-plan-review** — scaffold: `ruby-project`
```
scaffolds/ruby-project/
  Gemfile
  lib/
    example.rb          ← content from current fixtures/example.rb (referenced by plan.md)
  plan.md               ← content from current fixtures/plan.md
```

**project-discovery** (new scaffold) — scaffold: `polyglot-project`
```
scaffolds/polyglot-project/
  ruby-app/
    Gemfile
    lib/
      main.rb           ← simple Ruby class
  node-app/
    package.json
    src/
      index.js          ← simple Node module
```

**project-documentation** (new scaffold) — scaffold: `node-project`
```
scaffolds/node-project/
  package.json
  src/
    index.js            ← simple module with a function to document
  README.md             ← minimal readme
```

**create-adr** (new scaffold) — scaffold: `node-project`
```
scaffolds/node-project/
  package.json
  src/
    index.js
```

### 8. Update tests.json — add scaffold field to test cases

For each suite, add `"scaffold": "{name}"` to test cases that need project content. No-op tests (prompt: "do nothing") do NOT get a scaffold. Negative skill-call tests that reference project files DO get a scaffold so the referenced files exist.

**code-review/tests.json** — add `"scaffold": "ruby-project"` to:
- "Prompt: /code-review"
- "Skill Call: /code-review"
- "Skill Call: no code review" (references lib/example.rb)

**coding-standard/tests.json** — add `"scaffold": "ruby-project"` to:
- "Prompt: /coding-standard"
- "Skill Call: /coding-standard"
- "Skill Call: no coding standard" (prompt doesn't reference files, but writable+git helps)

**investigate/tests.json** — add `"scaffold": "ruby-project"` to:
- "Prompt: /investigate"
- "Skill Call: /investigate"
- "Skill Call: no investigate" (references lib/example.rb)

**test-planning/tests.json** — add `"scaffold": "ruby-project"` to:
- "Prompt: /test-planning"
- "Skill Call: /test-planning"

**iterative-plan-review/tests.json** — add `"scaffold": "ruby-project"` to:
- "Prompt: /iterative-plan-review"
- "Skill Call: /iterative-plan-review"
- "Skill Call: no iterative-plan-review" (references plan.md)

**project-discovery/tests.json** — add `"scaffold": "polyglot-project"` to:
- "Prompt: /project-discovery"
- "Skill Call: /project-discovery"

**project-documentation/tests.json** — add `"scaffold": "node-project"` to:
- "Prompt: /project-documentation"
- "Skill Call: /project-documentation"

**create-adr/tests.json** — add `"scaffold": "node-project"` to:
- "Prompt: /create-adr"
- "Skill Call: /create-adr"

### 9. Update prompt files — new fixture paths

Prompts that reference `fixtures/example.rb` must change to `lib/example.rb`. Prompts that reference `fixtures/plan.md` must change to `plan.md`.

| Prompt file | Old reference | New reference |
|-------------|--------------|---------------|
| `code-review/prompts/prompt-code-review.md` | `fixtures/example.rb` | `lib/example.rb` |
| `code-review/prompts/skill-call-code-review.md` | `fixtures/example.rb` | `lib/example.rb` |
| `code-review/prompts/skill-call-no-code-review.md` | `fixtures/example.rb` | `lib/example.rb` |
| `coding-standard/prompts/prompt-coding-standard.md` | `fixtures/example.rb` | `lib/example.rb` |
| `investigate/prompts/prompt-investigate.md` | `fixtures/example.rb` | `lib/example.rb` |
| `investigate/prompts/skill-call-investigate.md` | `fixtures/example.rb` | `lib/example.rb` |
| `investigate/prompts/skill-call-no-investigate.md` | `fixtures/example.rb` | `lib/example.rb` |
| `iterative-plan-review/prompts/prompt-iterative-plan-review.md` | `fixtures/plan.md` | `plan.md` |
| `iterative-plan-review/prompts/skill-call-iterative-plan-review.md` | `fixtures/plan.md` | `plan.md` |
| `iterative-plan-review/prompts/skill-call-no-iterative-plan-review.md` | `fixtures/plan.md` | `plan.md` |
| `test-planning/prompts/prompt-test-planning.md` | `fixtures/example.rb` | `lib/example.rb` |
| `test-planning/prompts/skill-call-test-planning.md` | `fixtures/example.rb` | `lib/example.rb` |

### 10. Delete old fixtures directories

Remove `fixtures/` from: code-review, coding-standard, investigate, iterative-plan-review, test-planning.

---

## Files Summary

| File | Action |
|------|--------|
| `tests/packages/Dockerfile` | **Delete** (moved) |
| `tests/packages/docker/Dockerfile` | **Create** (moved + updated) |
| `tests/packages/docker/entrypoint.sh` | **Create** |
| `tests/packages/cli/src/paths.ts` | **Edit** — add `dockerDir` |
| `tests/packages/cli/src/test-runners/steps/step-5-docker-build.ts` | **Rewrite** — use docker dir directly |
| `tests/packages/data/src/types.ts` | **Edit** — add `scaffold` to `TestCase` |
| `tests/packages/data/src/config.ts` | **Edit** — add `validateScaffolds()` |
| `tests/packages/cli/src/test-runners/prompt/index.ts` | **Edit** — mount + scaffold env var |
| `tests/packages/cli/src/test-runners/skill-call/index.ts` | **Edit** — mount + scaffold env var |
| 8x `tests/test-suites/*/tests.json` | **Edit** — add scaffold field |
| 12x `tests/test-suites/*/prompts/*.md` | **Edit** — update file paths |
| 8x `tests/test-suites/*/scaffolds/` | **Create** — scaffold project dirs |
| 5x `tests/test-suites/*/fixtures/` | **Delete** — replaced by scaffolds |

---

## Verification

1. **Build the harness:** `cd tests && make build`
2. **Docker build test:** `./harness test-run --suite coding-standard --debug` — verify:
   - Builds from `tests/packages/docker/` context
   - Entrypoint copies scaffold into `/workspace`
   - Git init + commit runs
   - Claude sees writable workspace with `lib/example.rb`
3. **Theme 1 regression tests:** Run all 5 originally-failing suites:
   - `./harness test-run --suite coding-standard` — failure 5
   - `./harness test-run --suite project-discovery` — failures 6-7
   - `./harness test-run --suite project-documentation` — failure 8
   - `./harness test-run --suite create-adr` — failure 9
4. **Non-regression tests:** Run previously-passing suites to verify mount change doesn't break them:
   - `./harness test-run --suite code-review`
   - `./harness test-run --suite investigate`
   - `./harness test-run --suite iterative-plan-review`
   - `./harness test-run --suite test-planning`
5. **Run test-eval** on all results to confirm expectations pass
6. **No-op tests:** Verify that tests WITHOUT scaffolds still work (writable workspace, no git, Claude responds correctly)
