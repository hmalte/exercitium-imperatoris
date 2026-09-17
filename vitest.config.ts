// Vitest config. Phase 0 has no tests yet; this is ready for Phase 1,
// where the date-math module (src/domain/timeLogic.ts) will land with full
// unit test coverage. Tests are colocated with sources as *.test.ts.

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
