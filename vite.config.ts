import { defineConfig, type Plugin, type ViteDevServer } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

/**
 * `/api/generate` は本番では Vercel の Serverless Function として動く。
 * dev サーバでも同じハンドラを叩けるように、Node の req/res を
 * Web標準の Request/Response に橋渡しする。
 */
function apiDevServer(): Plugin {
  return {
    name: "migaki-api-dev",
    apply: "serve",
    configureServer(server: ViteDevServer) {
      server.middlewares.use("/api/generate", async (req, res) => {
        try {
          const mod = await server.ssrLoadModule("/api/generate.ts");
          const chunks: Buffer[] = [];
          for await (const chunk of req) chunks.push(chunk as Buffer);
          const body = chunks.length ? Buffer.concat(chunks).toString("utf8") : undefined;
          const request = new Request(`http://localhost${req.url ?? "/"}`, {
            method: req.method ?? "GET",
            headers: req.headers as Record<string, string>,
            body,
          });
          const response: Response = await mod.default(request);
          res.statusCode = response.status;
          response.headers.forEach((v, k) => res.setHeader(k, v));
          res.end(await response.text());
        } catch (err) {
          res.statusCode = 500;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify({ error: String(err) }));
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    apiDevServer(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icons/apple-touch-icon.png", "data/*.json"],
      manifest: {
        name: "ミガキ殿",
        short_name: "ミガキ殿",
        description: "歯磨き中の気分・体調チェックイン",
        lang: "ja",
        start_url: "/",
        scope: "/",
        display: "standalone",
        orientation: "portrait",
        background_color: "#F2EFE6",
        theme_color: "#F2EFE6",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // シェルと固定質問JSONをプリキャッシュ → 固定パートはオフラインで動く
        globPatterns: ["**/*.{js,css,html,png,svg,json}"],
        navigateFallback: "index.html",
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            urlPattern: /\/data\/.*\.json$/,
            handler: "StaleWhileRevalidate",
            options: { cacheName: "migaki-questions" },
          },
        ],
      },
    }),
  ],
});
