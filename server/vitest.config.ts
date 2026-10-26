import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    globalSetup: ["test/global-setup.ts"],
    env: {
      NODE_ENV: "test",
      DATABASE_URL: "file:./test.db",
      TURSO_DATABASE_URL: "",
      STUDIO_TZ: "America/New_York",
    },
    // Database tests share one SQLite file.
    fileParallelism: false,
  },
});
