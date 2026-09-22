# Migrate sandbox integration to sbx

- **Status:** Superseded in part by [Consolidate Test Sandbox commands under a sandbox parent](./20260922104700-consolidate-sandbox-subcommands.md). The migration decision below stands. Its consequence that "Existing Skillwalker command names remain stable for users and scripts" no longer holds: `sandbox-setup`, `shell`, and `clean` became `sandbox setup`, `sandbox clean`, and `sandbox shell` on 2026-09-22, and the flat names were removed.

Skillwalker will hard-cut over from the deprecated `docker sandbox` subcommand to Docker's standalone `sbx` CLI for managing the **Test Sandbox**. We will rename `@testdouble/docker-integration` to `@testdouble/sandbox-integration` and `DockerError` to `SandboxError` at the same time, while keeping user-facing Skillwalker commands such as `sandbox-setup`, `shell`, and `clean` stable. We are not keeping a `docker sandbox` fallback because sandbox management is centralized behind a small package API, dual command support would add stale branching, and first-time setup should teach the current Test Sandboxes workflow (`sbx login` then `./skillwalker sandbox-setup`). The integration layer will also convert common `sbx` failures into tailored Skillwalker errors for missing CLI, auth/readiness failure, and missing named sandbox.

## Considered Options

- **Hard cutover to `sbx`** — simpler implementation, current upstream command surface, no stale compatibility path.
- **Compatibility adapter** — lower short-term risk for users with the old CLI, but adds branching around a retired command and keeps outdated terminology in the codebase.

## Consequences

- Developers must install and authenticate `sbx` before running the Skillwalker sandbox setup.
- The integration package name now describes Skillwalker boundary rather than the retired Docker CLI shape.
- Existing Skillwalker command names remain stable for users and scripts.
- Missing `sbx` installation or authentication failures produce explicit Skillwalker errors instead of raw process failures.
