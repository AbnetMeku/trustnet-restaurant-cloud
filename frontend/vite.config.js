import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import legacy from "@vitejs/plugin-legacy";
import path from "path";
import { VitePWA } from "vite-plugin-pwa";

const enablePwa = process.env.VITE_ENABLE_PWA === "true";

export default defineConfig({
  plugins: [
    react(),
    legacy({
      targets: ['ios >= 12']
    }),

    // ✅ Added PWA plugin
    VitePWA({
      disable: !enablePwa,
      registerType: "autoUpdate",
      includeAssets: ["favicon.ico", "robots.txt"],
      manifest: {
        name: "Restaurant POS",
        short_name: "POS",
        start_url: "/waiter-login",
        display: "standalone",
        background_color: "#ffffff",
        theme_color: "#1f2937",
        icons: [
          {
            src: "/icons/TNS-192.png",
            sizes: "192x192",
            type: "image/png"
          },
          {
            src: "/icons/TNS-512.png",
            sizes: "512x512",
            type: "image/png"
          }
        ]
      },
      workbox: {
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            // Cache static assets (JS, CSS, images)
            urlPattern: /\.(?:js|css|png|jpg|jpeg|svg|gif)$/i,
            handler: "CacheFirst",
            options: {
              cacheName: "static-assets",
              expiration: {
                maxEntries: 200,
                maxAgeSeconds: 60 * 60 * 24 * 30 // 30 days
              }
            }
          }
        ]
      }
    }),
  ],

  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  server: {
    host: true,
    port: 5173,
    proxy: {
      "/api/inventory": {
        target: "http://127.0.0.1:5001",
        changeOrigin: true,
        secure: false,
      },
      "/api": {
        target: "http://127.0.0.1:5000",
        changeOrigin: true,
        secure: false,
      },
    },
  },

  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) {
            return id
              .toString()
              .split("node_modules/")[1]
              .split("/")[0]
              .toString();
          }
        },
      },
    },
    chunkSizeWarningLimit: 500,
  },
});
