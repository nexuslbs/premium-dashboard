import { defineConfig } from "vite";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    // Use esbuild for minification instead of rollup
    minify: "esbuild",
  },
  // Disable CSS processing — Tailwind is loaded via CDN
  css: {
    postcss: false,
  },
});
