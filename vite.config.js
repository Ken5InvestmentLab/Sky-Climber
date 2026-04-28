import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const repository = process.env.GITHUB_REPOSITORY;
const repoName = repository?.split("/")[1];

export default defineConfig({
  plugins: [react()],
  base: repoName ? `/${repoName}/` : "/",
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
