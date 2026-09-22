.PHONY: sandbox-setup sandbox-clean dev build web update-analytics-data test clear-data

sandbox-setup: build
	./build/harness sandbox-setup

sandbox-clean:
	sbx rm --force claude-skills-harness

dev:
	bun install
	(cd packages/web && bun run dev) & \
	cd packages/web && bun --hot ./src/server/index.ts

build:
	bun install
	cd packages/web && bun run build
	bun run scripts/build.ts

web: build
	./build/harness-web

update-analytics-data: build
	./build/harness update-analytics-data

test:
	bun run vitest run --config vitest.all.config.ts

clear-data:
	rm -rdfv output/*
	rm -rdfv analytics/*
