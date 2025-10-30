import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@pal/core": path.resolve(__dirname, "../..", "packages", "pal-core", "src"),
    },
  },
  server: {
    port: 5173,
  },
});
