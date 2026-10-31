import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const root = path.dirname(fileURLToPath(import.meta.url));
const imgRoot = path.join(root, "img");

const types = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml"
};

function resolveImgFile(urlPath) {
  const pathname = decodeURIComponent(String(urlPath || "").split("?")[0]);
  if (pathname !== "/img" && !pathname.startsWith("/img/")) return null;
  // Strip leading slashes so path.join never treats the segment as absolute on Windows.
  const relative = pathname.replace(/^\/+/, "");
  const file = path.normalize(path.join(root, relative));
  const base = path.normalize(imgRoot);
  const full = file.toLowerCase();
  const baseLower = base.toLowerCase();
  if (full !== baseLower && !full.startsWith(baseLower + path.sep)) return null;
  return file;
}

function sendImg(req, res, next) {
  const file = resolveImgFile(req.url || "");
  if (!file) {
    if ((req.url || "").startsWith("/img")) {
      res.statusCode = 403;
      res.end("Forbidden");
      return;
    }
    return next();
  }
  fs.stat(file, (err, stat) => {
    if (err || !stat.isFile()) {
      res.statusCode = 404;
      res.end("Not found");
      return;
    }
    res.setHeader("Content-Type", types[path.extname(file).toLowerCase()] || "application/octet-stream");
    fs.createReadStream(file).pipe(res);
  });
}

/** Serve project `img/` in Vite so landing photos work without the Node server. */
function serveProjectImg() {
  return {
    name: "serve-project-img",
    configureServer(server) {
      server.middlewares.use(sendImg);
    },
    configurePreviewServer(server) {
      server.middlewares.use(sendImg);
    }
  };
}

export default defineConfig({
  plugins: [react(), serveProjectImg()],
  publicDir: "public",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    assetsDir: "assets"
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": "http://127.0.0.1:8765"
    }
  },
  preview: {
    host: "127.0.0.1",
    port: 4173,
    strictPort: true
  }
});
