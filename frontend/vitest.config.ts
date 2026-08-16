import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Separate from vite.config.ts on purpose — mixing `test` into the app's
// own Vite config works too, but keeping them apart means the dev/build
// config never has to know about test-only concerns (jsdom, setup files),
// and vice versa.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    css: false,
  },
});
