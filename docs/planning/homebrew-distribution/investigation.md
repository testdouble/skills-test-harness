# Investigation: Installing Skillwalker with Homebrew

Investigation report. Read the Summary, then approve the Planned Fix or push back.

## Summary

- **Root Cause:** Skillwalker can only be installed today by cloning the repo and running `make build`. Nothing produces a
  versioned, downloadable, correctly signed macOS build that Homebrew could install (E8, E9, E10, E16).
- **Fix:** Publish signed macOS release archives from a tag-triggered GitHub workflow. Install them with a Homebrew
  **formula** (not a cask) in a new `testdouble/homebrew-tap` repo. The formula keeps every sidecar file together in
  `libexec` and copies the sandbox scripts to a folder whose path stays the same across upgrades.
- **Why Correct:** The binaries already work from any directory through a symlink, because a compiled Bun binary
  reports its real path, not the symlink's (E4). Data paths come from the working directory, never the install folder
  (E5). What remains is packaging, signing, versioning, and one upgrade hazard (E7, E10).
- **Validation Outcome:** The repo-side claims held up (V3, V4, V6, V8). Validation added five error messages that
  still say `./build/skillwalker` to the fix (V2), plus a smoke test for the scripts-folder override (V5).
- **Remaining Risks:** Medium confidence. Two Homebrew behaviors are unverified until a real `brew install` and
  `brew upgrade`: that `post_install` re-runs on upgrade (V1), and that Homebrew leaves the signed binaries untouched
  (V7).

## Problem Statement

Skillwalker should install with one `brew install` command and work right away. Today you get it by cloning the repo,
installing Bun, running `make build`, and calling `./build/skillwalker` from the repo root (E16).

- **Expected behavior:** You run `brew install testdouble/tap/skillwalker` and get `skillwalker` and
  `skillwalker-web` on `PATH`. After `sbx login` and `skillwalker sandbox create`, you run evals from any project
  directory. A later `brew upgrade` keeps working without rebuilding the sandbox.
- **Conditions:** macOS on Apple silicon (arm64) and Intel (x86_64). `sbx`, the Docker Sandboxes command-line tool, is
  already a hard runtime requirement (E13).
- **Impact:** Anyone who wants to evaluate a Claude Code skill must first become a Skillwalker contributor. They need
  the Bun toolchain, a clone, and repo-relative commands.

## What stands between Skillwalker and a Homebrew install

### Root Cause

No release pipeline exists. No version is stamped into the binary, no macOS artifacts are built or signed, and no tap or
formula exists. The binaries themselves hold up under a Homebrew layout, with two exceptions: the code signature, and
a sandbox mount path that changes on every upgrade.

### Findings Behind the Root Cause

**The build is a folder, not one file.** `make build` produces six files that must sit side by side: `skillwalker`,
`skillwalker-web`, `duckdb.node`, `libduckdb.dylib`, `sandbox-run.sh`, and `sandbox-extract.sh` (E9). `duckdb.node` is
DuckDB's native Node add-on. It is loaded from the executable's own folder (E1), and it finds `libduckdb.dylib` next to
itself (E2). The two shell scripts are looked up the same way when the program starts. If one is missing, even
`skillwalker --help` crashes (E3). A Homebrew install must keep all six files together.

**Symlinks are safe.** Homebrew puts real files in a versioned `Cellar/skillwalker/<version>/` folder and links
commands into `/opt/homebrew/bin`. I ran a Bun-compiled binary through a symlink from another directory.
`process.execPath` reported the real `libexec/` path. `update-analytics-data` ran through the symlink (it loads
DuckDB), and `skillwalker-web` served its API (E4).

**A read-only Cellar is fine, too.** Output and analytics folders come from the working directory or from flags,
never from the install folder. The web client files are embedded in the binary (E5, E6).

**The code signature is broken as built.** `codesign --verify` rejects both locally built binaries: "invalid signature
(code or signature have been modified)" (E10). `bun build --compile` appends the JavaScript bundle after the linker has
already signed the file. Newer macOS releases kill binaries with invalid signatures, and another Bun-compiled Homebrew
formula hit exactly this (E11). Removing the signature and ad-hoc signing again fixes it, and the re-signed binary
runs (E10). An ad-hoc signature is a local signature with no Apple developer identity behind it.

**A cask is the wrong vehicle.** Homebrew's cask repository stops supporting casks that fail Gatekeeper, macOS's check
on downloaded apps, on September 1, 2026. That means Apple Developer ID signing and notarization for any cask (E12).
A formula in a third-party tap has no such requirement. Bun ships its own tap the same way: a formula that downloads
prebuilt archives (E12).

**`sbx` cannot be a formula dependency.** On this machine `sbx` is installed as a cask (`Caskroom/sbx/0.29.0`), and a
formula cannot depend on a cask (E13). The formula prints install instructions for `sbx` in its caveats instead.

**Upgrades would force a new sandbox.** `sandbox create` mounts the folder holding the sandbox scripts into the
sandbox, and every run checks that the mount is still there (E7). Under Homebrew that folder is
`Cellar/skillwalker/<version>/libexec`, so every `brew upgrade` changes the path. The next run fails with "does not
mount a required path" until you run `skillwalker sandbox update`. That command deletes the sandbox, and you log in to
Claude again (E7). The scripts need a folder whose path does not change between versions.

**There is no version to ship.** `skillwalker --version` prints `unknown`. Every package sits at `0.1.0`, the repo has
no git tags, and CI runs only on Ubuntu with no release job (E8). A formula needs a tagged release URL, a checksum,
and a version its test can check.

## Planned Fix

### Approach

Stamp a version into the binary, re-sign and verify it at build time, publish per-architecture macOS archives from a
tag-triggered workflow, and install them with a formula in `testdouble/homebrew-tap`. The formula moves the sandbox
scripts to a path that stays the same across upgrades.

### Changes

#### `packages/cli/src/version.ts` (new) and `packages/cli/index.ts`

- **Change:** Give the CLI a real `--version`.
- **Evidence:** (E8)
- **Standards:** ESM Import Conventions. No lint disabling.
- **Details:** The build defines a `SKILLWALKER_VERSION` global. `version.ts` reads it and falls back to `dev` when
  running from source, so no lint-disable comment is needed. `index.ts` calls `.version(skillwalkerVersion)` on the
  yargs chain.

  ```ts
  // packages/cli/src/version.ts
  declare const SKILLWALKER_VERSION: string | undefined
  export const skillwalkerVersion = typeof SKILLWALKER_VERSION === 'string' ? SKILLWALKER_VERSION : 'dev'
  ```

  Add a unit test for the `dev` fallback. The smoke test covers the stamped value.

#### `scripts/build.ts`

- **Change:** Stamp the version, then re-sign and verify both binaries on macOS.
- **Evidence:** (E8), (E10), (E11)
- **Standards:** Matches the script's existing style: top-level `await`, and `console.log` lines for each artifact.
- **Details:**
  1. Read the version from the `SKILLWALKER_VERSION` environment variable. Fall back to `packages/cli/package.json`'s
     `version`. Pass it through `define: { SKILLWALKER_VERSION: JSON.stringify(version) }` in `Bun.build`.
  2. When `process.platform === 'darwin'`, run the following for each compiled binary, and throw if any command
     exits non-zero. Stripping first is required because the Bun 1.3.x signature cannot be re-signed in place (E11).

     ```sh
     codesign --remove-signature <binary>
     codesign --force --sign - <binary>
     codesign --verify <binary>
     ```

  3. Do the same for `duckdb.node` and `libduckdb.dylib` only if `codesign --verify` fails on them. They come from npm
     already signed, and they were not checked in this investigation.

#### `packages/claude-integration/src/sandbox-scripts.ts`

- **Change:** Let an environment variable choose where the sandbox scripts live.
- **Evidence:** (E3), (E7)
- **Standards:** Custom Error Class Hierarchy, if a new error is thrown. Otherwise match the plain `Error` that
  `resolveRelativePath` throws today.
- **Details:** When `SKILLWALKER_SCRIPTS_DIR` is set, `sandboxRunScript` and `sandboxExtractScript` become
  `path.join(dir, 'sandbox-run.sh')` and `path.join(dir, 'sandbox-extract.sh')`. Each must exist, and the error names
  the variable if one does not. When the variable is unset, behavior is unchanged. Add unit tests for set, unset, and
  missing-file cases, following the Vitest Mocking Patterns for environment stubs. Document the variable in
  `docs/claude-integration.md`.

#### `packages/sandbox-integration/src/lifecycle.ts` and `packages/sandbox-integration/src/sandbox.ts`

- **Change:** Replace every `./build/skillwalker` in user-facing messages with the bare `skillwalker` command.
- **Evidence:** (V2)
- **Details:** The five messages are at `lifecycle.ts:76`, `lifecycle.ts:96`, `lifecycle.ts:112`, `sandbox.ts:38`, and
  `sandbox.ts:77`. A Homebrew user has no `./build/` folder. `ensureSandboxExists` already says `skillwalker sandbox
  update` without the prefix (`sandbox.ts:80`), so this matches it. Update any tests that assert on these strings.

#### `packages/cli/src/compiled-binary.smoke.test.ts`

- **Change:** Exercise the Homebrew layout.
- **Evidence:** (E4), (E17), (V5)
- **Standards:** Integration Test Lifecycle: temp directory in `beforeEach`/`afterEach`.
- **Details:** Add four tests:
  1. Copy `build/` into `<tmp>/libexec` and symlink `<tmp>/bin/skillwalker` to it. Run `update-analytics-data`
     through the symlink from a third directory, and assert exit 0 and a Parquet file.
  2. Assert `--version` prints the stamped version, not `unknown` or `dev`.
  3. Run the compiled binary twice with `SKILLWALKER_SCRIPTS_DIR` set. When the variable points at an empty folder,
     `--help` fails and the error names the variable. When it points at a folder holding both scripts, `--help`
     succeeds. This proves the override reaches the compiled binary, not only the unit-tested module.
  4. On macOS only (`it.skipIf(process.platform !== 'darwin')`), assert that `codesign --verify` passes on both
     binaries.

#### `.github/workflows/release.yml` (new)

- **Change:** Build, test, package, and publish macOS archives when a `v*` tag is pushed.
- **Evidence:** (E8), (E9), (E14), (E15)
- **Standards:** Mirrors `ci.yml`: `actions/checkout@v7` and `oven-sh/setup-bun@v2`.
- **Details:**
  1. Matrix of `macos-15` (arm64) and an Intel macOS runner (x86_64). Check the current Intel label, for example
     `macos-15-intel`, before merging.
  2. Pin `bun-version: 1.4.2` explicitly, to match `packageManager`.
  3. Steps: `bun install --frozen-lockfile`, then `SKILLWALKER_VERSION=${GITHUB_REF_NAME#v} make build`, then
     `bun run test:smoke`.
  4. Package the six build files as `skillwalker-<version>-darwin-<arm64|x86_64>.tar.gz` with a top-level folder, and
     upload them to the GitHub Release with `gh release upload`.
  5. A final job runs `mislav/bump-homebrew-formula-action` against `testdouble/homebrew-tap`. It needs a
     `HOMEBREW_TAP_TOKEN` repository secret with write access to the tap. That secret is a manual prerequisite.

  Also add a `macos-15` smoke job to `ci.yml`. Today macOS builds are exercised only on release.

#### `packages/cli/package.json`

- **Change:** Set the first release version (for example `0.2.0`) in `packages/cli/package.json`.
- **Evidence:** (E8)
- **Details:** The CLI package is the fallback source for the version, and the git tag drives releases. Tag `v0.2.0`
  after merging.

#### `testdouble/homebrew-tap` → `Formula/skillwalker.rb` (new repo)

- **Change:** Create the tap repo and the formula.
- **Evidence:** (E1)–(E4), (E7), (E12), (E13), (E14), (E18)
- **Standards:** Homebrew Formula Cookbook (web).
- **Details:** `url` and `sha256` go inside `on_arm`/`on_intel` blocks under `on_macos`, with `depends_on :macos` so
  Linux never evaluates a missing URL (E18). Run `brew audit --strict --new` and `brew readall` in the tap before the
  first release.

  ```ruby
  class Skillwalker < Formula
    desc "Evaluate Claude Code skills and agents"
    homepage "https://github.com/testdouble/skillwalker"
    version "0.2.0"
    license "MIT"
    depends_on :macos

    on_macos do
      on_arm do
        url "https://github.com/testdouble/skillwalker/releases/download/v#{version}/skillwalker-#{version}-darwin-arm64.tar.gz"
        sha256 "..."
      end
      on_intel do
        url "https://github.com/testdouble/skillwalker/releases/download/v#{version}/skillwalker-#{version}-darwin-x86_64.tar.gz"
        sha256 "..."
      end
    end

    def install
      libexec.install Dir["*"]
      (bin/"skillwalker").write_env_script libexec/"skillwalker",
        SKILLWALKER_SCRIPTS_DIR: var/"skillwalker/sandbox-scripts"
      bin.write_exec_script libexec/"skillwalker-web"
    end

    # var/ is outside the versioned Cellar, so the sandbox mount survives
    # `brew upgrade`. Expected to re-run on upgrade; verify before the first
    # release (see V1).
    def post_install
      (var/"skillwalker/sandbox-scripts").mkpath
      cp libexec/"sandbox-run.sh", var/"skillwalker/sandbox-scripts/"
      cp libexec/"sandbox-extract.sh", var/"skillwalker/sandbox-scripts/"
    end

    def caveats
      <<~EOS
        Skillwalker runs Claude Code inside Docker Sandboxes. Install and log in to sbx:
          brew install docker/tap/sbx
          sbx login
        Then, from the repo you want to evaluate:
          skillwalker sandbox create
      EOS
    end

    test do
      assert_match version.to_s, shell_output("#{bin}/skillwalker --version")
      system "codesign", "--verify", libexec/"skillwalker"
      mkdir "o"
      system bin/"skillwalker", "update-analytics-data", "--output-dir", "o", "--data-dir", "a"
    end
  end
  ```

  `write_env_script` and `write_exec_script` place a small shell wrapper in `bin` that `exec`s the real file. With
  this approach, the program never has to resolve its own symlink, which avoids depending on the E4 behavior.

  Before tagging the first release, run this manual check against the published tap:
  1. `brew install` the release, then run `skillwalker sandbox create` and one `skillwalker test-run`.
  2. Publish a second version (for example `0.2.1`), then run `brew upgrade`.
  3. Confirm that `var/skillwalker/sandbox-scripts` holds the new scripts and that `test-run` works without
     `sandbox update` (V1).
  4. Confirm that `codesign --verify` still passes on every file in `libexec` (V7).

#### `README.md`, `docs/cli.md`, `docs/sandbox-integration.md`

- **Change:** Document the Homebrew install.
- **Evidence:** (E16)
- **Details:** Lead the README's Prerequisites and Setup with `brew install testdouble/tap/skillwalker` and bare
  `skillwalker` commands. Move `make build` to a "Build from source" subsection. Add the upgrade note to
  `docs/sandbox-integration.md`'s troubleshooting: sandboxes created before this change still mount the old scripts
  folder, so run `skillwalker sandbox update` once.

## Evidence Summary

### E1: The DuckDB add-on loads from the executable's own folder

- **Source:** `scripts/build.ts:39-45`
- **Finding:**
  ```js
  const addon = { exports: {} }
  process.dlopen(addon, join(dirname(process.execPath), 'duckdb.node'))
  ```
- **Relevance:** `duckdb.node` must sit beside the real executable. No existence check comes before `dlopen`.

### E2: `duckdb.node` finds `libduckdb.dylib` beside itself

- **Source:** `otool -L` and `otool -l` on `build/duckdb.node`
- **Finding:**
  ```
  @rpath/libduckdb.dylib
  cmd LC_RPATH  path @loader_path
  ```
- **Relevance:** This works in any folder, as long as both files are real files in the same place.

### E3: Sandbox scripts are resolved at startup, and a missing one crashes every command

- **Source:** `packages/bun-helpers/src/resolve.ts:9-19`, `packages/claude-integration/src/sandbox-scripts.ts:4-12`,
  plus a manual test
- **Finding:**
  ```ts
  const resolved = dir.includes('$bunfs')
    ? path.resolve(path.dirname(process.execPath), compiledPath)
    : path.resolve(dir, sourcePath)
  if (!fs.existsSync(resolved)) throw new Error(`Resolved path does not exist: ...`)
  ```
  With `sandbox-run.sh` removed from the install folder, `skillwalker --help` exited 1 with that error.
- **Relevance:** Every sidecar file is required for every command. The override variable must fail as clearly.

### E4: A compiled binary run through a symlink resolves to its real folder

- **Source:** Manual test in a scratch `libexec/` + `bin/` layout
- **Finding:**
  ```
  $ ../bin/ep            # compiled `console.log(process.execPath)`, symlinked
  .../brewtest/libexec/ep
  $ ../bin/skillwalker update-analytics-data --output-dir o --data-dir a   → exit 0
  $ curl .../api/test-runs  (via bin/skillwalker-web symlink)              → 200
  ```
- **Relevance:** A Homebrew symlink or wrapper layout works. Local Bun was 1.3.11. The release uses 1.4.2, and the new
  smoke test re-checks this on 1.4.2.

### E5: Data paths come from the working directory or flags

- **Source:** `packages/cli/src/paths.ts:1-10`, `packages/execution/src/lib/path-config.ts:10-19`,
  `packages/web/src/server/index.ts:23-27`
- **Finding:**
  ```ts
  const config = createPathConfig(process.cwd())
  default: path.resolve(process.cwd(), 'analytics'),
  ```
- **Relevance:** Nothing is written under the read-only Cellar.

### E6: Web client assets are embedded in the binary

- **Source:** `packages/web/src/server/index.ts:4-7,37-42`
- **Finding:**
  ```ts
  import indexJs from '../../dist/client/index.js' with { type: 'file' }
  ```
- **Relevance:** `skillwalker-web` needs no asset folder on disk. It does not import the sandbox scripts (its
  dependencies are listed in `packages/web/package.json`).

### E7: The sandbox mounts the scripts folder and checks it before every run

- **Source:** `packages/cli/src/commands/sandbox/create.ts:17`, `packages/sandbox-integration/src/lifecycle.ts:85-89`,
  `docs/sandbox-integration.md:101,176,292`
- **Finding:**
  ```ts
  await createSandbox(argv['repo-root'] as string, [sandboxScriptsDir])
  ```
  > `runEvals` and the SCIL and ACIL loops pass `[sandboxScriptsDir]` ... checks that every path in `requiredPaths` is
  > inside one of its workspaces

  The README says `sandbox update` "deletes the sandbox and recreates it ... so you will log in again."
- **Relevance:** A versioned Cellar path would force a sandbox rebuild and a new login after every upgrade.

### E8: There is no version, tag, or release pipeline

- **Source:** `package.json:1-3` (no `version`), `packages/*/package.json:3` (`0.1.0`), `git tag` (empty),
  `.github/workflows/` (only `ci.yml`, all 8 jobs `ubuntu-latest`), manual test
- **Finding:**
  ```
  $ skillwalker --version
  unknown
  ```
- **Relevance:** A formula needs a release URL, a checksum, and a version its test can check.

### E9: The build targets only the host platform and emits six files

- **Source:** `scripts/build.ts:24-35,96-104`
- **Finding:**
  ```ts
  target: 'bun',
  compile: { outfile: path.join(BUILD_DIR, target.outfile) },
  ```
- **Relevance:** arm64 and x86_64 archives need separate runners, and each archive carries all six files.

### E10: Locally built binaries fail signature verification, and re-signing fixes them

- **Source:** `codesign` run on `build/`
- **Finding:**
  ```
  build/skillwalker: invalid signature (code or signature have been modified)
  build/skillwalker-web: invalid signature (code or signature have been modified)
  $ codesign --remove-signature X && codesign --force --sign - X && codesign --verify X
  X: valid on disk / satisfies its Designated Requirement   (and still runs)
  ```
  macOS 26.5.1. Built with local Bun 1.3.11.
- **Relevance:** The release must re-sign and verify. It is unconfirmed whether Bun 1.4.2 output verifies without
  this step, so the plan re-signs every time.

### E11 (web): Bun-compiled binaries need re-signing, and Homebrew has hit this before

- **Source:** Homebrew/homebrew-core#304671; oven-sh/bun #29361, #32159, #29120; `bun.sh/docs/bundler/executables`
- **Finding:** The payload is appended after linker signing. On macOS 26/27 the result is `SIGKILL, Code Signature
  Invalid`. The fix was an ad-hoc re-sign and a `codesign --verify` check in the formula test.
- **Relevance:** Corroborates E10 and supports the build-time re-sign step.

### E12 (web): Formula, not cask, for an unsigned prebuilt CLI in a third-party tap

- **Source:** `docs.brew.sh/Acceptable-Formulae`; `oven-sh/homebrew-bun` `Formula/bun.rb`; Homebrew/brew#20755;
  `workbrew.com/blog/homebrew-5-0-0`
- **Finding:** Bun's tap is a formula that downloads prebuilt zips. Casks that fail Gatekeeper lose support on
  September 1, 2026.
- **Relevance:** Choosing a cask would mean paying for Developer ID signing and notarization.

### E13: `sbx` is a cask, so the formula cannot depend on it

- **Source:** `ls -la $(which sbx)`; Homebrew/brew#17326; `discourse.brew.sh` thread 3557 (web)
- **Finding:**
  ```
  /opt/homebrew/bin/sbx -> /opt/homebrew/Caskroom/sbx/0.29.0/bin/sbx
  ```
  `depends_on cask:` fails with "Unsupported special dependency :cask".
- **Relevance:** List `sbx` in the formula's caveats instead of declaring a dependency.

### E14 (web): Tap naming and formula-bump automation

- **Source:** `docs.brew.sh/How-to-Create-and-Maintain-a-Tap`; `github.com/mislav/bump-homebrew-formula-action`
- **Finding:** A repo named `testdouble/homebrew-tap` enables `brew install testdouble/tap/skillwalker`. The action
  bumps `url`/`sha256` through the GitHub API.
- **Relevance:** Tap name and release-time formula updates.

### E15: The repo is public and MIT licensed

- **Source:** `gh repo view` (`"isPrivate":false`); `LICENSE:1-3`
- **Relevance:** Release downloads need no token.

### E16: Setup docs assume a clone

- **Source:** `README.md:27-49`
- **Finding:**
  ```
  All commands run from the **repository root**.
  make build
  ./build/skillwalker sandbox create
  ```
- **Relevance:** The docs need a Homebrew-first path.

### E17: Smoke tests run binaries only from `build/`, on Ubuntu

- **Source:** `packages/cli/src/compiled-binary.smoke.test.ts:11-13`; `.github/workflows/ci.yml` (`test-compiled-binaries`
  on `ubuntu-latest`)
- **Relevance:** Neither the Homebrew layout nor macOS signing is covered by any test.

### E18 (web): `url` placement inside architecture blocks can break tap loading

- **Source:** `stuffbucket/maximal#455`, `stuffbucket/homebrew-tap#3` (one incident)
- **Finding:** A missing `url` for some OS/arch combination broke `brew readall` for the tap.
- **Relevance:** Use `depends_on :macos` and run `brew audit`/`brew readall` before release. Single-source, so treat
  it as something to verify.

## Validation Results

An adversarial validator tried to disprove the evidence and break the fix. Its findings follow.

### Counter-Evidence Investigated

#### V1: Does the stable scripts folder stay current across upgrades?

- **Hypothesis:** The `var/skillwalker/sandbox-scripts` design fails if `post_install` does not re-run on
  `brew upgrade`.
- **Investigation:** Traced every consumer of the scripts paths. Each one uses the folder only as a host path passed
  to `sbx`, and neither script refers to a sibling file, so moving them is safe. Files checked: `run-claude.ts:25`,
  `extract-output-files.ts:10`, `sandbox/create.ts:17`, `sandbox/update.ts:19`, `scil/loop.ts:46`,
  `acil/loop.ts:47`, and `run-evals.ts:33`.
- **Result:** Partially Refuted. The repo-side mechanics work. Whether `post_install` re-runs on upgrade is a Homebrew
  behavior with no citation in this report.
- **Impact:** If it does not re-run, the path stays valid but the scripts go stale, and nothing fails loudly. The plan
  now marks this as expected-but-unverified and adds a manual upgrade check before the first release.

#### V2: Error messages still point at `./build/skillwalker`

- **Hypothesis:** The plan misses user-facing strings that would mislead Homebrew users.
- **Investigation:** `grep` found five: `lifecycle.ts:76,96,112` and `sandbox.ts:38,77` in
  `packages/sandbox-integration/src/`.
- **Result:** Confirmed.
- **Impact:** Added a change entry that replaces them with bare `skillwalker`.

#### V3: Does the version global break under Vitest or the type check?

- **Hypothesis:** `typeof SKILLWALKER_VERSION` throws when Bun's `define` does not run.
- **Investigation:** `typeof` on an undeclared name returns `"undefined"` without throwing. `packages/cli/tsconfig.json`
  is `strict` with no conflicting globals, and `biome.json`'s `recommended` preset has no rule against an ambient
  `declare const`.
- **Result:** Refuted.
- **Impact:** None.

#### V4: Does re-signing interfere with the Linux CI job or the native-file copy?

- **Hypothesis:** The codesign step breaks `test-compiled-binaries` on Ubuntu, or conflicts with the size-based skip
  in `copyDuckdbNativeFiles`.
- **Investigation:** The step is gated on `darwin`, so it never runs on Ubuntu. If `duckdb.node` ever needed
  re-signing, its size would change. A second `make build` would then copy the unsigned original back, and the verify
  step would re-sign it again.
- **Result:** Confirmed safe. The two steps converge on a signed file.
- **Impact:** Implementation should run `make build` twice in a row once to confirm that.

#### V5: Nothing tests the scripts-folder override in the compiled binary

- **Hypothesis:** The formula's `test do` covers the upgrade fix.
- **Investigation:** `test do` checks `--version`, `codesign`, and `update-analytics-data`. None of these touch
  `SKILLWALKER_SCRIPTS_DIR`. `sbx` cannot run in Homebrew's test environment.
- **Result:** Confirmed gap.
- **Impact:** Added smoke test 3, which runs the compiled binary with the variable set.

#### V6: Is a sandbox created before this change handled?

- **Hypothesis:** An old sandbox, still mounting the previous scripts folder, fails silently.
- **Investigation:** `ensureSandboxExists` (`sandbox.ts:70-84`) throws a `SandboxError` that names the missing path
  and says to run `skillwalker sandbox update`.
- **Result:** Confirmed handled. The failure is loud and correct.
- **Impact:** None beyond V2 and the doc note.

#### V7: Could Homebrew rewrite the binaries and break their signature?

- **Hypothesis:** Homebrew's install-time relocation patches the Mach-O files in `libexec` and invalidates the
  signature.
- **Investigation:** No evidence either way in this report. The formula has no bottle and downloads a tarball that
  Homebrew did not build. The binaries therefore contain no Homebrew prefix placeholders to rewrite. That reasoning is
  plausible but unverified.
- **Result:** Unverified.
- **Impact:** The `codesign --verify` line in `test do` catches it before release. The manual upgrade check now also
  verifies every `libexec` file.

#### V8: Does `skillwalkerDir` assume a monorepo layout?

- **Hypothesis:** `path.join(testsDir, 'packages')` in `path-config.ts:11` breaks for users outside the repo.
- **Investigation:** The only reference outside its definition is a re-export in `packages/cli/src/paths.ts:8`.
  Nothing reads it.
- **Result:** Refuted. It is unused.
- **Impact:** None. It is a cleanup candidate.

### Adjustments Made

- Added the `packages/sandbox-integration` message change (V2).
- Added smoke test 3 for `SKILLWALKER_SCRIPTS_DIR` in the compiled binary (V5).
- Marked the `post_install` comment as unverified, and added a manual install-then-upgrade check before the first
  release (V1, V7).

### Confidence Assessment

- **Confidence:** Medium.
- **Remaining Risks:**
  - `post_install` re-running on upgrade (V1) and Homebrew leaving the signed files alone (V7) are unverified until a
    real `brew install` and `brew upgrade`.
  - Bun 1.4.2 output was not tested. E4 and E10 used local Bun 1.3.11.
  - Several details come only from web sources and should be confirmed during implementation: the Intel runner label,
    the exact `write_env_script` signature, the bump action's inputs, and the `on_arm`/`on_intel` layout (E14, E18).
  - Docker's install page showed a `brew trust docker/tap` step that no Homebrew documentation mentions. The caveats
    text uses only `brew install docker/tap/sbx`, which matches Docker's `sbx-releases` README.

## Coding Standards Reference

| Standard | Source | Applies To |
| --- | --- | --- |
| ESM Import Conventions | `docs/coding-standards/esm-import-conventions.md` | `version.ts`, `index.ts`, `sandbox-scripts.ts` |
| No Lint Disabling | `docs/coding-standards/no-lint-disabling.md` | `declare const` pattern in `version.ts` |
| Custom Error Class Hierarchy | `docs/coding-standards/custom-error-hierarchy.md` | Any new error in `sandbox-scripts.ts` |
| Test File Organization and Naming | `docs/coding-standards/test-file-organization.md` | New `.test.ts` and `.smoke.test.ts` cases |
| Vitest Mocking Patterns | `docs/coding-standards/vitest-mocking-patterns.md` | Environment-variable stubs in `sandbox-scripts` tests |
| Integration Test Lifecycle | `docs/coding-standards/integration-test-lifecycle.md` | Temp `libexec`/`bin` layout in smoke tests |
| Build-script style (top-level await, per-artifact log lines) | Inferred from `scripts/build.ts` | Signing and version steps |
| CI action versions | Inferred from `.github/workflows/ci.yml` | `release.yml` |
