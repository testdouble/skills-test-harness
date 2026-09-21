# Scope Boundary: Bun Runtime and Dependency Upgrade

## Work Item

No ticket, issue, or pull request exists. The operator's typed request to `/han-planning:plan-a-change` on 2026-09-21
is the only boundary this run has.

## Stated Scope

> update the project to the latest version of the bun runtime, and update all dependencies, to ensure everything is
> good to go and working

## Stated Exclusions

None stated.

## Operator-Stated Scope

Confirmed in the Step 1.5 confirmation turn (2026-09-21):

- "Include the majors" — "update all dependencies" includes the four major-version jumps available today: React 18→19,
  React Router 6→7, Vitest 4→5, marked 15→18. Each major upgrade becomes its own unit so it can be reverted alone.
- "Yes, that's the whole area" — the area is: root `package.json` and `bun.lock`; the eight `packages/*/package.json`
  manifests; `.github/workflows/ci.yml`; `Makefile`; the three `vitest*.config.ts` files; `packages/web/vite.config.ts`;
  `biome.json`; the `tsconfig` files; the docs that state versions (`README.md`, `docs/project-discovery.md`); and
  source code in `packages/web` only where a major upgrade forces a change.
- Output folder: `docs/planning/bun-runtime-dependency-upgrade/`.

## Direction of Travel

"No, nothing is being replaced" — every current dependency stays and is upgraded in place. Vitest is not being
replaced by `bun test`; React Router is not being dropped.

## Visual Material Received

None received

## Record Provenance

Established by `han-planning:plan-a-change` on 2026-09-21. Not inherited.
