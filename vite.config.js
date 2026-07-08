import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

//vite.dev/config/

export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  // Set the third parameter to '' to load all env variables regardless of the 'VITE_' prefix.
  const env = loadEnv(mode, process.cwd(), "");

  return {
    plugins: [react()],
    base: env.VITE_BASE_PATH || "/Subscription-Tracker",
  };
});
