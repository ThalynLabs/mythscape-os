import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  // Assets served under /ui/ — matches the daemon's existing StaticFiles mount
  base: "/ui/",
  // Build outputs to ../ui/ — the directory daemon.py already serves
  build: {
    outDir: path.resolve(__dirname, "../ui"),
    emptyOutDir: true,
  },
  // Dev server proxies /api/* and /health to the daemon on 9355
  server: {
    port: 9354,
    proxy: {
      "/api": "http://localhost:9355",
      "/health": "http://localhost:9355",
    },
  },
});
