import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Explicit, not relying on vitest's `test.globals: true` — this project
// imports describe/it/expect/vi explicitly everywhere else, no implicit
// globals, so the test setup shouldn't be the one place that's different.
// Without this, @testing-library/react won't auto-unmount components
// between tests (its built-in auto-cleanup only registers itself when it
// detects a global afterEach), which would leak mounted components —
// and, for AuthContext specifically, pending setTimeout-scheduled
// refreshes — across tests.
afterEach(() => {
  cleanup();
});
