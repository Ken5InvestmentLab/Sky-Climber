import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const repoFromEnv = process.env.GITHUB_REPOSITORY?.split("/")[1];
const defaultRepo = "Sky-Climber";
const repoName = repoFromEnv || defaultRepo;

export default defineConfig({
  plugins: [react()],
  base: `/${repoName}/`,
});
