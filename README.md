# Test Harness

A test harness for evaluating Claude Code skills and agents. It measures two
things you can improve independently:

- **Trigger accuracy** — does Claude call your skill (or delegate to your
  agent) when it *should*, and stay quiet when it *shouldn't*?
- **Effectiveness** — once invoked, does the output meet quality criteria you
  define? An LLM judge scores it against a rubric.

You write evals, run them inside a Test Sandbox, and track trigger accuracy,
output quality, and cost over time through a dashboard and analytics. **Skills**
and **agents** each have their own trigger-accuracy and effectiveness paths —
pick the one that matches what you're improving.

## Prerequisites

- **Docker Sandboxes (`sbx`)** — the harness runs Claude Code inside Docker
  Sandboxes via the standalone `sbx` CLI. Install `sbx` using Docker's
  instructions, then run `sbx login` before creating the harness sandbox.
- **Bun** — the CLI and web app are built with Bun. Install from
  [bun.sh](https://bun.sh).

## Setup

All commands run from the **repository root**.

1. **Build the harness.** This installs dependencies and compiles the `harness`
   and `harness-web` binaries:

   ```bash
   make build
   ```

2. **Create the Test Sandbox and log in.** Authenticate the Sandbox CLI, then
   create a persistent sandbox and open Claude Code so you can authenticate:

   ```bash
   sbx login
   ./harness sandbox-setup
   ```

   Complete the login in the Claude TUI. If you aren't prompted, run `/login`.
   When setup finishes, exit with `/exit`.

You're ready. Now choose what you want to measure.

## What do you want to measure?

Pick the path that matches your goal — each is a short, end-to-end guide.

**Improving a custom skill**

1. [Know *when* Claude should call my skill](docs/getting-started/skill-trigger-accuracy.md) — trigger accuracy
2. [Make my skill better *at its job*](docs/getting-started/skill-effectiveness.md) — effectiveness

**Improving a custom agent**

1. [Know *when* Claude should delegate to my agent](docs/getting-started/agent-trigger-accuracy.md) — trigger accuracy
2. [Make my agent better *at its job*](docs/getting-started/agent-effectiveness.md) — effectiveness

After your first run, [view results in the dashboard](docs/getting-started/viewing-results.md)
and [query trends with analytics](docs/getting-started/analytics.md).

---

## Reference

Everything above is all you need for first-time use. The links below are
reference material — reach for them when a guide points you here.

### Getting Started Guides

- [Skill Trigger Accuracy](docs/getting-started/skill-trigger-accuracy.md) — measure and improve when Claude calls your skill
- [Skill Effectiveness](docs/getting-started/skill-effectiveness.md) — measure and improve skill output quality with LLM-judge rubrics
- [Agent Trigger Accuracy](docs/getting-started/agent-trigger-accuracy.md) — measure and improve when Claude delegates to your agent
- [Agent Effectiveness](docs/getting-started/agent-effectiveness.md) — measure and improve agent output quality with LLM-judge rubrics
- [Viewing Results](docs/getting-started/viewing-results.md) — using the harness-web dashboard
- [Analytics](docs/getting-started/analytics.md) — importing data and CLI queries

### Full Workflow Guides

- [Building SCIL Evals](docs/scil-evals-guide.md) — manual test authoring and the Skill Call Improvement Loop
- [Building Rubric Evals](docs/rubric-evals-guide.md) — manual rubric authoring and iterating on LLM-judge quality criteria

### Configuration Reference

- [Test Suite Reference](docs/test-suite-reference.md) — full `tests.json` field reference: test types, expectation types, validation
- [Test Scaffolding](docs/test-scaffolding.md) — how scaffolds provide project context inside the Test Sandbox

### Eval Authoring Skills

Claude Code skills that generate eval suites for you:

- [Building Skill Eval Scaffolds](docs/build-skill-eval-scaffold.md) — `/build-skill-eval-scaffold`: analysis, signal planning, scaffold generation
- [Building Agent Eval Scaffolds](docs/build-agent-eval-scaffold.md) — `/build-agent-eval-scaffold`: the agent equivalent
- [Writing Skill-Call Evals](docs/write-scil-evals.md) — `/write-scil-evals`: prompt categories, output format
- [Writing Agent-Call Evals](docs/write-acil-evals.md) — `/write-acil-evals`: the agent equivalent
- [Writing Skill Eval Rubrics](docs/write-skill-eval-rubric.md) — `/write-skill-eval-rubric`: criteria categories, output format
- [Writing Agent Eval Rubrics](docs/write-agent-eval-rubric.md) — `/write-agent-eval-rubric`: the agent equivalent
- [Script Extraction](docs/script-extraction.md) — `/script-extraction`: hardening skills by extracting mechanical steps into shell scripts

### Deep Dives

- [Skill Call Improvement Loop](docs/skill-call-improvement-loop.md) — SCIL mechanics: holdout splits, scoring, improvement prompt, CLI flags
- [Agent Call Improvement Loop](docs/agent-call-improvement-loop.md) — ACIL mechanics: agent detection, temp plugin isolation, holdout splits, scoring
- [LLM Judge Evaluation](docs/llm-judge.md) — judge mechanics: prompt construction, scoring, output format, error handling
- [Parquet Schema](docs/parquet-schema.md) — field reference for analytics Parquet files

### Architecture

- [Test Harness Architecture](docs/test-harness-architecture.md) — system architecture, package boundaries, data flow, and dependency graph
- [Sandbox Integration](docs/sandbox-integration.md) — Test Sandbox architecture, API, lifecycle, and consumer patterns
- [Project Discovery](docs/project-discovery.md) — generated project attributes: languages, frameworks, tooling, commands

### Package Documentation (contributor)

- [CLI](docs/cli.md) — Yargs command layer and path resolution
- [Execution](docs/execution.md) — test-run pipeline, test-eval, SCIL/ACIL orchestration, error hierarchy
- [Data](docs/data.md) — shared data layer: types, config parsing, JSONL I/O, DuckDB analytics, SCIL utilities
- [Evals](docs/evals.md) — evaluation engine: boolean evals, LLM judge scoring, rubric parsing, orchestrator
- [Claude Integration](docs/claude-integration.md) — Claude CLI wrapper API, argument construction, sandbox delegation
- [Sandbox Integration Package](docs/sandbox-integration-package.md) — Test Sandbox API: full public interface, error handling, testing patterns
- [Web](docs/web.md) — Hono API server, React SPA, test run and SCIL views, per-test analytics
- [Bun Helpers](docs/bun-helpers.md) — cross-runtime path resolution utilities
- [Test Fixtures](docs/test-fixtures.md) — shared fixture data, loadFixtures utility, analytics JSONL scenarios

## Maintenance and Support

- **Maintenance horizon:** Indefinitely maintained, best-effort. No SLA.
- **Project type:** Personal project, with some Test Double support.
- **How to report issues:** GitHub Issues, with best-effort response within 2 weeks.

Han is an open source product of [Test Double](https://testdouble.com), and maintained by the following people:

- [River Lynn Bailey](https://github.com/mxriverlynn): Creator, and primary maintainer

## LEGAL NOTICES

Copyright 2026 [Test Double, Inc](https://testdouble.com). Distributed under the [MIT license](./LICENSE).
