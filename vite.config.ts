import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { readFileSync } from "fs";

// Numéro de cette publication : l'app le compare à /version.json pour se mettre à jour toute seule.
const BUILD_ID = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) || String(Date.now());
const BUILD_TIME = new Date().toISOString();
// Le service worker porte ce numéro : chaque publication en est un nouveau pour le navigateur.
const swSource = () => `${readFileSync(path.resolve(__dirname, "src/sw/sw.js"), "utf8")}\n// version ${BUILD_ID}\n`;

// https://vitejs.dev/config/
export default defineConfig(({ isSsrBuild }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID), __BUILD_TIME__: JSON.stringify(BUILD_TIME) },
  plugins: [
    react(),
    {
      name: "ooble-version",
      apply: "build",
      generateBundle() {
        if (isSsrBuild) return;
        this.emitFile({ type: "asset", fileName: "version.json", source: JSON.stringify({ id: BUILD_ID, at: BUILD_TIME }) });
        this.emitFile({ type: "asset", fileName: "sw.js", source: swSource() });
      },
    },
    {
      // En développement : /sw.js servi depuis src/sw.
      name: "ooble-sw-dev",
      apply: "serve",
      configureServer(server) {
        server.middlewares.use("/sw.js", (_req, res) => { res.setHeader("Content-Type", "application/javascript"); res.end(swSource()); });
      },
    },
  ],
  // Le bundle de pré-rendu (vite build --ssr) n'a pas besoin des fichiers de public/.
  build: { copyPublicDir: !isSsrBuild },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
