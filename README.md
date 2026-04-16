# Test Harness

A test harness for evaluating Claude Code skills — measuring trigger accuracy, output quality, and cost. Run skill-call evals to test whether prompts route to the right skill, rubric evals to judge output quality, and track everything through analytics.

## Prerequisites

- **Docker** — the harness runs Claude Code in a Docker sandbox. Install [Docker Desktop](https://www.docker.com/products/docker-desktop/).
- **Bun** — the CLI and web app are built with Bun. Install from [bun.sh](https://bun.sh).

## Getting Started

All commands run from the `tests/` directory.

1. **Build the harness:**

```bash
make build
```

2. **Set up the Docker sandbox.** 

You'll need to create a persistent sandbox and launches Claude Code for OAuth login, with this command:

```bash
./harness sandbox-setup
```

Once you're in the Claude TUI, complete the login and initial setup. If you're not prompted to log in, use 
the `/login` command. After doing that, you can exit claude with `/exit`.

## What do you want to test and improve?

From here, you'll need to think about what you want to do. Use the following questions and guides based on
what problem you want to solve.

### Custom Skill Improvement

1. [I want to improve Claude's ability to know when it should call my custom skill.](docs/getting-started/skill-trigger-accuracy.md)
2. [I want to improve my skill's effectiveness at doing its job.](docs/getting-started/skill-effectiveness.md)

### Custom Agent Improvement

1. [I want to improve Claude's ability to know when it should call my custom agent.](docs/getting-started/agent-trigger-accuracy.md)
2. [I want to improve my agent's effectiveness at doing its job.](docs/getting-started/agent-effectiveness.md)

## References

### Getting Started
- [Skill Trigger Accuracy](docs/getting-started/skill-trigger-accuracy.md) — measure and improve when Claude calls your skill
- [Skill Effectiveness](docs/getting-started/skill-effectiveness.md) — measure and improve skill output quality with LLM-judge rubrics
- [Agent Trigger Accuracy](docs/getting-started/agent-trigger-accuracy.md) — measure and improve when Claude delegates to your agent
- [Agent Effectiveness](docs/getting-started/agent-effectiveness.md) — measure and improve agent output quality with LLM-judge rubrics
- [Viewing Results](docs/getting-started/viewing-results.md) — using the harness-web dashboard
- [Analytics](docs/getting-started/analytics.md) — importing data and CLI queries

### Guides
- [Building SCIL Evals](docs/scil-evals-guide.md) — step-by-step guide to writing and running trigger accuracy evals
- [Building Rubric Evals](docs/rubric-evals-guide.md) — step-by-step guide to writing and running LLM-judge quality evals

### Configuration
- [Test Suite Configuration](docs/test-suite-configuration.md) — full tests.json field reference: test types, expectation types, validation
- [Test Scaffolding](docs/test-scaffolding.md) — how scaffolds provide project context inside the Docker sandbox

### Eval Skills
- [Creating Test Scaffolds](docs/create-scaffold.md) — the `/create-scaffold` skill: analysis, signal planning, scaffold generation
- [Writing Skill-Call Evals](docs/write-scil-evals.md) — the `/write-scil-evals` skill: workflow, prompt categories, output format
- [Writing Rubric Evals](docs/write-rubric-evals.md) — the `/write-rubric-evals` skill: workflow, criteria categories, output format

### Skill Development
- [Script Extraction](docs/script-extraction.md) — the `/script-extraction` skill: hardening skills by extracting mechanical steps into shell scripts

### Deep Dives
- [Skill Call Improvement Loop](docs/skill-call-improvement-loop.md) — SCIL mechanics: holdout splits, scoring, improvement prompt, CLI flags
- [LLM Judge Evaluation](docs/llm-judge.md) — judge mechanics: prompt construction, scoring, output format, error handling
- [Parquet Schema](docs/parquet-schema.md) — field reference for analytics Parquet files

### Architecture
- [Test Harness Architecture](docs/test-harness-architecture.md) — system architecture, package boundaries, data flow, and dependency graph
- [Docker Integration](docs/docker-integration.md) — Docker sandbox architecture, API, lifecycle, and consumer patterns
- [Project Discovery](docs/project-discovery.md) — project attributes: languages, frameworks, tooling, commands
- [Test Plan](docs/test-plan.md) — overall test strategy
- [Analytics Integration Test Plan](docs/test-plan-analytics-integration.md) — analytics integration test plan

### Package Documentation
- [CLI](docs/cli.md) — CLI commands, test-run pipeline, test-eval, SCIL loop, temp plugin construction, error handling
- [Data](docs/data.md) — shared data layer: types, config parsing, JSONL I/O, DuckDB analytics, SCIL utilities
- [Evals](docs/evals.md) — evaluation engine: boolean evals, LLM judge scoring, rubric parsing, orchestrator
- [Claude Integration](docs/claude-integration.md) — Claude CLI wrapper API, argument construction, sandbox delegation
- [Docker Integration](docs/docker-integration-package.md) — Docker sandbox API: full public interface, error handling, testing patterns
- [Web](docs/web.md) — Hono API server, React SPA, test run and SCIL views, per-test analytics
- [Bun Helpers](docs/bun-helpers.md) — cross-runtime path resolution utilities
- [Test Fixtures](docs/test-fixtures.md) — shared fixture data, loadFixtures utility, analytics JSONL scenarios

## Copyright and License

Copyright 2026 [Test Double](https://testdouble.com). All Rights Reserved.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

[https://www.apache.org/licenses/LICENSE-2.0](https://www.apache.org/licenses/LICENSE-2.0)

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
