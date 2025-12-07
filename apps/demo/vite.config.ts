import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  base: "./",
  resolve: {
    alias: {
      "@chimple/palau-recommendation": path.resolve(
        __dirname,
        "../..",
        "packages",
        "recommendation",
        "src"
      ),
    },
  },
  server: {
    port: 5173,
  },
});
