.PHONY: sandbox-setup sandbox-clean dev build web update-analytics-data test clear-data

sandbox-setup: build
	./build/skillwalker sandbox-setup

sandbox-clean:
	sbx rm --force claude-skills-skillwalker

dev:
	bun install
	(cd packages/web && bun run dev) & \
	cd packages/web && bun --hot ./src/server/index.ts

build:
	bun install
	cd packages/web && bun run build
	bun run scripts/build.ts

web: build
	./build/skillwalker-web

update-analytics-data: build
	./build/skillwalker update-analytics-data

test:
	bun run vitest run --config vitest.all.config.ts

clear-data:
	rm -rdfv output/*
	rm -rdfv analytics/*
