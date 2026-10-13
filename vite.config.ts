import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// Numéro de cette publication : l'app le compare à /version.json pour se mettre à jour toute seule.
const BUILD_ID = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) || String(Date.now());

// https://vitejs.dev/config/
export default defineConfig(({ isSsrBuild }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
  plugins: [
    react(),
    {
      name: "ooble-version",
      apply: "build",
      generateBundle() {
        if (!isSsrBuild) this.emitFile({ type: "asset", fileName: "version.json", source: JSON.stringify({ id: BUILD_ID }) });
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
