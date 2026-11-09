import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // Relative Pfade: Die App läuft so auch in einem Unterordner, z. B. bei GitHub Pages.
  base: "./",
  resolve: {
    alias: {
      // pdfkit gibt seinen Browser-Build mit den eingebauten Schriften nicht über "exports" frei.
      "pdfkit/js/pdfkit.standalone.js": fileURLToPath(new URL("./node_modules/pdfkit/js/pdfkit.standalone.js", import.meta.url)),
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: "auto",
      includeAssets: ["apple-touch-icon.png", "icon-192.png", "icon-512.png"],
      manifest: {
        name: "Teilewerk",
        short_name: "Teilewerk",
        description: "Lager und Rechnungen für gebrauchte Roller-Teile, offline auf dem iPhone",
        lang: "de",
        display: "standalone",
        orientation: "portrait",
        start_url: "./",
        scope: "./",
        background_color: "#0593C6",
        theme_color: "#0593C6",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // Die App muss auch ohne Netz vollständig starten, inklusive PDF-Bibliothek.
        // Schriften gehören dazu, damit der Look auch ohne Netz stimmt. Vietnamesisch wird nie gebraucht.
        globPatterns: ["**/*.{js,css,html,png,webmanifest,woff2}"],
        globIgnores: ["**/*vietnamese*"],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        navigateFallback: "index.html",
      },
    }),
  ],
  test: {
    environment: "node",
    setupFiles: ["./test/setup.ts"],
    include: ["test/**/*.test.ts"],
  },
});
