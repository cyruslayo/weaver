import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const page = (name: string): string => fileURLToPath(new URL(name, import.meta.url));

// index.html is the Basic demo. inspector.html is the development-only trace inspector.
export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        index: page("./index.html"),
        inspector: page("./inspector.html"),
      },
    },
  },
});
