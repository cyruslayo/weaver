import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const page = (name: string): string => fileURLToPath(new URL(name, import.meta.url));

// index.html is the hosted Playground. components.html is the Basic component bench.
// inspector.html is the development-only trace inspector. PLAYGROUND_BASE sets the
// public path, for example /weaver/playground/ for GitHub Pages; it defaults to the dev root.
export default defineConfig({
  base: process.env.PLAYGROUND_BASE ?? "/",
  build: {
    rollupOptions: {
      input: {
        index: page("./index.html"),
        components: page("./components.html"),
        inspector: page("./inspector.html"),
      },
    },
  },
});
