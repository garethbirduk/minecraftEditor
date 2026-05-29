import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { exec } from "node:child_process";
import { loadLibraryDir, writeLibraryDir } from "./scripts/libdir.js";

/**
 * Dev-only endpoint: POST /__sync runs `npm run sync` (bake library/ ->
 * .mcstructure + deploy into Minecraft) server-side, so the editor's
 * "Sync → MC" button can deploy. Save the library first so the bake reflects
 * the current editor state.
 */
function syncPlugin(): Plugin {
  return {
    name: "mc-sync",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/__sync", (req, res, next) => {
        if (req.method !== "POST") {
          next();
          return;
        }
        exec("npm run sync", { cwd: server.config.root, windowsHide: true }, (err, stdout, stderr) => {
          const output = `${stdout}\n${stderr}`.slice(-4000);
          res.setHeader("Content-Type", "application/json");
          res.statusCode = err ? 500 : 200;
          res.end(JSON.stringify({ ok: !err, output }));
        });
      });
    },
  };
}

/**
 * Dev-only endpoint so the editor can read and write the git-tracked library/
 * folder (the project's source of truth, one JSON file per component).
 *   GET  /__library -> { components: [{ category, ...componentJSON }] }
 *   POST /__library <- same shape; replaces the folder contents.
 */
function libraryRWPlugin(): Plugin {
  return {
    name: "library-rw",
    apply: "serve",
    configureServer(server) {
      const dir = resolve(server.config.root, "library");
      server.middlewares.use("/__library", (req, res, next) => {
        if (req.method === "GET") {
          const loaded = loadLibraryDir(dir);
          const components = loaded.map((l) => ({ category: l.category, ...l.json }));
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ components }));
          return;
        }
        if (req.method === "POST") {
          let body = "";
          req.on("data", (c: Buffer) => (body += c.toString("utf8")));
          req.on("end", () => {
            try {
              const parsed = JSON.parse(body) as {
                components: Array<{ category?: string; id: string; kind: string }>;
              };
              const comps = parsed.components.map((c) => {
                const { category, ...json } = c;
                return { category: category ?? "", json: json as never };
              });
              writeLibraryDir(dir, comps);
              res.statusCode = 204;
              res.end();
            } catch (err) {
              res.statusCode = 400;
              res.end(String(err));
            }
          });
          return;
        }
        next();
      });
    },
  };
}

export default defineConfig({
  // Honour BASE_URL so the same build can serve from a subpath
  // (e.g. GitHub Pages /minecraftEditor/) and from / in local dev.
  base: process.env.BASE_URL ?? "/",
  plugins: [react(), libraryRWPlugin(), syncPlugin()],
  server: {
    // Out of the common dev-server range so this doesn't fight other
    // local projects (trader uses 6173). strictPort = fail, don't roll.
    port: 6180,
    strictPort: true,
    open: false,
  },
});
