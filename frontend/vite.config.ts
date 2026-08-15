import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  // The project keeps a single .env at the repo root (see ../.env.example)
  // instead of one per app — point Vite at it rather than frontend/.env.
  envDir: "..",
  server: {
    host: true,
    port: 5173,
  },
});
