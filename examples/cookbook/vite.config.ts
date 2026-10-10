import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const page = (name: string): string =>
  fileURLToPath(new URL(name, import.meta.url));

// One HTML entry per screen. index.html is the landing page that links to them.
export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        index: page("./index.html"),
        placeholder: page("./placeholder.html"),
        "ticket-board": page("./ticket-board.html"),
      },
    },
  },
});
