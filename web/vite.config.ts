import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { writeFileSync } from "node:fs";
export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  plugins: [
    react(),
    {
      name: "keep-embed-directory",
      closeBundle() {
        writeFileSync(
          fileURLToPath(new URL("dist/.gitkeep", import.meta.url)),
          "",
        );
      },
    },
  ],
  server: {
    host: "127.0.0.1",
    port: 5178,
    strictPort: true,
    proxy: { "/api": "http://127.0.0.1:19080" },
  },
  build: { outDir: "dist", emptyOutDir: true },
});
