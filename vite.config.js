import { defineConfig } from "vite";

const xintianProxy = {
  "/api/xintian": {
    target: "https://story.taoyuanyangxintuina.shop",
    changeOrigin: true,
    secure: true,
  },
  "/xintian/assets": {
    target: "https://story.taoyuanyangxintuina.shop",
    changeOrigin: true,
    secure: true,
  },
};

export default defineConfig({
  base: "./",
  server: {
    host: true,
    port: 5174,
    allowedHosts: true,
    proxy: xintianProxy,
  },
  preview: {
    host: true,
    port: 4174,
    proxy: xintianProxy,
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
