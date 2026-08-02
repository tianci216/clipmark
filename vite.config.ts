import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": "http://127.0.0.1:8899",
      "/video": "http://127.0.0.1:8899",
    },
  },
  test: {
    environment: "node",
  },
});
