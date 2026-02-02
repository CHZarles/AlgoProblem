import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig(() => {
  const base = process.env.VITE_BASE ?? "/";
  const isDemo = process.env.VITE_DEMO === "true";
  return {
    base,
    plugins: [react()],
    server: isDemo
      ? undefined
      : {
          proxy: {
            "/api": {
              target: "http://localhost:8787",
              changeOrigin: true,
            },
          },
        },
  };
});
