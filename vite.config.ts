import { defineConfig } from "vite";

export default defineConfig({
  envPrefix: ["VITE_", "YVP_"],
  server: { host: true, allowedHosts: true },
  build: {
    lib: {
      entry: "src/embed.ts",
      name: "ScriptureInline",
      formats: ["iife"],
      fileName: () => "scripture-inline.js",
    },
  },
});
