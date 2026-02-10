import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

export default defineConfig({
  plugins: [viteSingleFile()],
  esbuild: {
    jsx: "automatic",
  },
  build: {
    target: "esnext",
    minify: false,
    rollupOptions: {
      input: "src/mcp-app.html",
      output: {
        inlineDynamicImports: true,
      },
    },
  },
});
