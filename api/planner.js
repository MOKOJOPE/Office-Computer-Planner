import { Redis } from "@upstash/redis";
import { STARTER_PLANNER, normalizePlanner } from "../src/plannerData.js";

const PLANNER_KEY = "office-computer-planner:shared";

function getRedis() {
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;

  if (!url || !token) {
    return null;
  }

  return new Redis({ url, token });
}

async function readRequestJson(req) {
  if (req.body && typeof req.body === "object") {
    return req.body;
  }

  if (typeof req.body === "string") {
    return JSON.parse(req.body || "{}");
  }

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

function sendJson(res, statusCode, payload) {
  res.status(statusCode).json(payload);
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  const redis = getRedis();
  if (!redis) {
    sendJson(res, 500, {
      error:
        "Shared storage is not configured. Add Upstash Redis environment variables in Vercel.",
    });
    return;
  }

  if (req.method === "GET") {
    try {
      const saved = await redis.get(PLANNER_KEY);
      if (saved) {
        sendJson(res, 200, { created: false, planner: normalizePlanner(saved) });
        return;
      }

      const planner = normalizePlanner(STARTER_PLANNER);
      await redis.set(PLANNER_KEY, planner);
      sendJson(res, 200, { created: true, planner });
    } catch {
      sendJson(res, 500, { error: "Could not load shared schedule." });
    }
    return;
  }

  if (req.method === "PUT") {
    try {
      const planner = normalizePlanner(await readRequestJson(req));
      await redis.set(PLANNER_KEY, planner);
      sendJson(res, 200, { planner });
    } catch {
      sendJson(res, 400, { error: "Could not save shared schedule." });
    }
    return;
  }

  res.setHeader("Allow", "GET, PUT, OPTIONS");
  sendJson(res, 405, { error: "Method not allowed." });
}
