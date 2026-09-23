import { defineConfig } from "vitest/config";

// Also read by tests/api/global-setup.ts, which runs in this process.
process.env.TEST_DATABASE_URL ??= "postgresql://postgres:postgres@localhost:5432/powerwise_test";
const testDatabaseUrl = process.env.TEST_DATABASE_URL;

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "unit",
          include: ["tests/unit/**/*.test.ts"],
          env: { DATABASE_URL: "postgresql://unused" },
        },
      },
      {
        test: {
          name: "api",
          include: ["tests/api/**/*.test.ts"],
          globalSetup: ["tests/api/global-setup.ts"],
          env: { DATABASE_URL: testDatabaseUrl, LOG_LEVEL: "silent" },
          // All API tests share one database, so run the files one after another.
          fileParallelism: false,
        },
      },
    ],
  },
});
