import { defineConfig } from 'vitest/config'

// Runs against the binaries in ./build — run `make build` first.
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['packages/*/src/**/*.smoke.test.ts'],
    testTimeout: 30000,
  },
})
