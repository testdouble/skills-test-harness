import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['packages/*/src/**/*.test.ts'],
    // Smoke tests need `make build` output; run them with `bun run test:smoke`.
    exclude: ['packages/*/src/**/*.smoke.test.ts', '**/node_modules/**'],
    testTimeout: 30000,
  },
})
