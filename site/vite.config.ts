import { defineConfig } from "vite";

// SITE_BASE sets the public path. GitHub Pages serves this site at /weaver/, so the
// Pages build sets SITE_BASE=/weaver/. Local development and plain builds use "/".
export default defineConfig({
  base: process.env.SITE_BASE ?? "/",
});
