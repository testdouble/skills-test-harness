DUCKDB_PLATFORM := $(shell bun -e "process.stdout.write(process.platform + '-' + process.arch)")
TESTS_DIR := $(shell pwd)

sandbox-setup: build
	./harness sandbox-setup

sandbox-clean:
	docker sandbox rm claude-skills-harness

dev:
	bun install
	(cd packages/web && bun run dev) & \
	cd packages/web && bun --hot ./src/server/index.ts

build:
	bun install
	cd packages/web && bun run build
	cd packages/web && bun build ./src/server/index.ts --compile --outfile $(TESTS_DIR)/harness-web \
		--external '@duckdb/node-bindings-linux-x64' \
		--external '@duckdb/node-bindings-linux-arm64' \
		--external '@duckdb/node-bindings-darwin-x64' \
		--external '@duckdb/node-bindings-darwin-arm64' \
		--external '@duckdb/node-bindings-win32-arm64' \
		--external '@duckdb/node-bindings-win32-x64'
	cd packages/cli && bun build ./index.ts --compile --outfile $(TESTS_DIR)/harness \
		--external '@duckdb/node-bindings-linux-x64' \
		--external '@duckdb/node-bindings-linux-arm64' \
		--external '@duckdb/node-bindings-darwin-x64' \
		--external '@duckdb/node-bindings-darwin-arm64' \
		--external '@duckdb/node-bindings-win32-arm64' \
		--external '@duckdb/node-bindings-win32-x64'
	DUCKDB_DIR=$$(find node_modules/.bun -maxdepth 6 -name "duckdb.node" -path "*node-bindings-$(DUCKDB_PLATFORM)*" 2>/dev/null | head -1 | xargs dirname) && \
	rm -rf node_modules/@duckdb/node-bindings-$(DUCKDB_PLATFORM) && \
	ln -sf $(TESTS_DIR)/$$DUCKDB_DIR node_modules/@duckdb/node-bindings-$(DUCKDB_PLATFORM) && \
	cp $$DUCKDB_DIR/libduckdb.dylib $(TESTS_DIR)/libduckdb.dylib

web: build
	./harness-web

update-analytics-data: build
	./harness update-analytics-data

test:
	bunx vitest run --config vitest.all.config.ts

clear-data:
	rm -rdfv output/*
	rm -rdfv analytics/*
