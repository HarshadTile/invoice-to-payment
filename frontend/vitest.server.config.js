import { defineConfig } from 'vitest/config';

// Server-side tests run in Node and talk to the local MySQL instance — but to a
// separate `mahindra_i2p_test` database, because every test file re-seeds
// (truncates) its database and must never touch the demo data.
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['server/**/*.test.js'],
    env: { DB_NAME: 'mahindra_i2p_test' },
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 30000,
  },
});
