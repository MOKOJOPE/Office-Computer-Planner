import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { STARTER_PLANNER, normalizePlanner } from "./src/plannerData.js";

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(rootDir, "data");
const plannerFile = path.join(dataDir, "planner.json");

async function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";

    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error("Request body is too large."));
        req.destroy();
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

async function writePlannerFile(planner) {
  const normalized = normalizePlanner(planner);
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(
    plannerFile,
    JSON.stringify({ ...normalized, updatedAt: new Date().toISOString() }, null, 2),
  );
  return normalized;
}

async function readPlannerFile() {
  try {
    const saved = await fs.readFile(plannerFile, "utf8");
    return { created: false, planner: normalizePlanner(JSON.parse(saved)) };
  } catch (error) {
    if (error.code && error.code !== "ENOENT") {
      throw error;
    }

    const planner = await writePlannerFile(STARTER_PLANNER);
    return { created: true, planner };
  }
}

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
}

function sharedPlannerApi() {
  const clients = new Set();

  function broadcast(planner) {
    const payload = `data: ${JSON.stringify({ planner })}\n\n`;
    for (const client of clients) {
      client.write(payload);
    }
  }

  return {
    name: "shared-planner-api",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url ?? "/", "http://localhost");

        if (url.pathname === "/api/planner/events") {
          try {
            const { planner } = await readPlannerFile();
            res.writeHead(200, {
              "Cache-Control": "no-cache, no-transform",
              Connection: "keep-alive",
              "Content-Type": "text/event-stream",
              "X-Accel-Buffering": "no",
            });
            res.write(`data: ${JSON.stringify({ planner })}\n\n`);
            clients.add(res);

            const heartbeat = setInterval(() => {
              res.write(": keep-alive\n\n");
            }, 25000);

            req.on("close", () => {
              clearInterval(heartbeat);
              clients.delete(res);
            });
          } catch {
            sendJson(res, 500, { error: "Could not open schedule sync." });
          }
          return;
        }

        if (url.pathname === "/api/planner" && req.method === "GET") {
          try {
            sendJson(res, 200, await readPlannerFile());
          } catch {
            sendJson(res, 500, { error: "Could not load schedule." });
          }
          return;
        }

        if (url.pathname === "/api/planner" && req.method === "PUT") {
          try {
            const body = await readBody(req);
            const planner = normalizePlanner(JSON.parse(body || "{}"));
            const savedPlanner = await writePlannerFile(planner);
            broadcast(savedPlanner);
            sendJson(res, 200, { planner: savedPlanner });
          } catch {
            sendJson(res, 400, { error: "Could not save schedule." });
          }
          return;
        }

        next();
      });
    },
  };
}

export default defineConfig({
  cacheDir: ".vite-cache",
  plugins: [sharedPlannerApi(), react()],
});
