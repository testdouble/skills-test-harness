# Changelog

All notable changes to Skillwalker are listed here, newest release first.

## v0.2.0 - 2026-09-23

This is the first tagged Skillwalker release, with signed programs for macOS. Skillwalker now runs Claude Code inside Docker Sandboxes through the sbx command. Sandbox commands now live under one parent command, with new create and update options. The dashboard and analytics commands no longer fail when data is missing or incomplete. Several names changed, so read the breaking changes before updating an older checkout.

### New Features

- Test Sandbox - Runs Claude Code inside Docker Sandboxes through the `sbx` command. [#5](https://github.com/testdouble/skillwalker/pull/5), [#4](https://github.com/testdouble/skillwalker/issues/4) by [@robsdudeson](https://github.com/robsdudeson)
- `skillwalker sandbox update` - Recreates the sandbox from the latest Claude Code template. [#11](https://github.com/testdouble/skillwalker/pull/11) by [@mxriverlynn](https://github.com/mxriverlynn)

#### Eval authoring plugin

- `eval-authoring` plugin - Installs the eval-writing skills from this repo's Claude Code plugin marketplace.
- Eval writing skills - Scaffold builders and the four write skills now check their output with scripts.
- `--for trigger` - Builds scaffolds that give trigger-accuracy tests realistic project context.
- `/audit-evals` - Reports where an eval has drifted from the skill or agent it tests.

#### Homebrew-ready releases

- Release archives - Each version tag builds signed macOS archives for Apple silicon and Intel. [#17](https://github.com/testdouble/skillwalker/pull/17) by [@mxriverlynn](https://github.com/mxriverlynn)
- `SKILLWALKER_SCRIPTS_DIR` - Points Skillwalker at sandbox scripts kept in a folder that survives upgrades. [#17](https://github.com/testdouble/skillwalker/pull/17) by [@mxriverlynn](https://github.com/mxriverlynn)

### Enhancements

- `skillwalker --version` - Prints the release version instead of "unknown". [#17](https://github.com/testdouble/skillwalker/pull/17) by [@mxriverlynn](https://github.com/mxriverlynn)
- Documentation - Guides now start with what to do first and link to details. [#2](https://github.com/testdouble/skillwalker/pull/2) by [@mxriverlynn](https://github.com/mxriverlynn)
- Security updates - Web dependencies are patched for five moderate security advisories. [#2](https://github.com/testdouble/skillwalker/pull/2) by [@mxriverlynn](https://github.com/mxriverlynn)
- Dependencies - Bun 1.4.2, React 19, and every other library now run their latest releases. [#6](https://github.com/testdouble/skillwalker/pull/6) by [@mxriverlynn](https://github.com/mxriverlynn)
- Standalone repository - Skillwalker now builds, tests, and checks itself in its own repository. [#1](https://github.com/testdouble/skillwalker/pull/1) by [@mxriverlynn](https://github.com/mxriverlynn)

### Bug Fixes

- macOS code signature - Compiled programs now pass signature checks, so macOS no longer blocks them. [#17](https://github.com/testdouble/skillwalker/pull/17) by [@mxriverlynn](https://github.com/mxriverlynn)
- Command errors - Failures print one clear Error line instead of help text and a stack trace. [#12](https://github.com/testdouble/skillwalker/pull/12) by [@mxriverlynn](https://github.com/mxriverlynn)

#### Sandbox reliability

- Sandbox scripts mount - Test runs now work when the target repo is not the Skillwalker repo. [#12](https://github.com/testdouble/skillwalker/pull/12) by [@mxriverlynn](https://github.com/mxriverlynn)
- Failed sandbox commands - Runs now fail with an error instead of reporting success with zero tokens. [#12](https://github.com/testdouble/skillwalker/pull/12) by [@mxriverlynn](https://github.com/mxriverlynn)
- `skillwalker sandbox create` - A failed login or download now stops with an error instead of "Sandbox is ready". [#16](https://github.com/testdouble/skillwalker/pull/16) by [@mxriverlynn](https://github.com/mxriverlynn)
- `skillwalker sandbox update` - No longer fails when one template image is listed under several IDs. [#11](https://github.com/testdouble/skillwalker/pull/11) by [@mxriverlynn](https://github.com/mxriverlynn)
- Sandbox error messages - Retry hints now say `skillwalker` instead of the `./build/skillwalker` path. [#17](https://github.com/testdouble/skillwalker/pull/17) by [@mxriverlynn](https://github.com/mxriverlynn)

#### Dashboard and analytics data

- `skillwalker update-analytics-data` - Creates the analytics folder when it does not exist yet. [#13](https://github.com/testdouble/skillwalker/pull/13) by [@mxriverlynn](https://github.com/mxriverlynn)
- Test run detail page - No longer fails when a judge gives a perfect whole-number score. [#14](https://github.com/testdouble/skillwalker/pull/14) by [@mxriverlynn](https://github.com/mxriverlynn)
- Missing analytics data - Every dashboard page shows empty results instead of a server error. [#15](https://github.com/testdouble/skillwalker/pull/15) by [@mxriverlynn](https://github.com/mxriverlynn)
- Improvement loop and cost pages - Whole-number scores and costs no longer break the history and analytics pages. [#16](https://github.com/testdouble/skillwalker/pull/16) by [@mxriverlynn](https://github.com/mxriverlynn)

### Breaking Changes

- Program names - `harness` and `harness-web` are now `skillwalker` and `skillwalker-web`, and the sandbox is `claude-skills-skillwalker`. [#8](https://github.com/testdouble/skillwalker/pull/8) by [@mxriverlynn](https://github.com/mxriverlynn)
- Eval folder - The default `test-suites/` folder is now `evals/`. [#9](https://github.com/testdouble/skillwalker/pull/9) by [@mxriverlynn](https://github.com/mxriverlynn)
- Sandbox commands - `sandbox-setup`, `clean`, and `shell` are now `sandbox create`, `sandbox clean`, and `sandbox shell`. [#10](https://github.com/testdouble/skillwalker/pull/10), [#11](https://github.com/testdouble/skillwalker/pull/11) by [@mxriverlynn](https://github.com/mxriverlynn)
- Build output - Compiled programs now go into `./build` instead of the repository root. [#7](https://github.com/testdouble/skillwalker/pull/7) by [@mxriverlynn](https://github.com/mxriverlynn)
