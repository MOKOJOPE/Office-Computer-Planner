import { neon } from "@neondatabase/serverless";
import { STARTER_PLANNER, normalizePlanner } from "../src/plannerData.js";

const PLANNER_ID = "shared";

function getSql() {
  const databaseUrl = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;

  if (!databaseUrl) {
    return null;
  }

  return neon(databaseUrl);
}

async function ensurePlannerTable(sql) {
  await sql`
    CREATE TABLE IF NOT EXISTS office_planner (
      id TEXT PRIMARY KEY,
      data JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
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

  const sql = getSql();
  if (!sql) {
    sendJson(res, 500, {
      error: "Shared storage is not configured. Add DATABASE_URL from Neon in Vercel.",
    });
    return;
  }

  if (req.method === "GET") {
    try {
      await ensurePlannerTable(sql);
      const rows = await sql`
        SELECT data
        FROM office_planner
        WHERE id = ${PLANNER_ID}
        LIMIT 1
      `;

      if (rows[0]?.data) {
        sendJson(res, 200, { created: false, planner: normalizePlanner(rows[0].data) });
        return;
      }

      const planner = normalizePlanner(STARTER_PLANNER);
      await sql`
        INSERT INTO office_planner (id, data, updated_at)
        VALUES (${PLANNER_ID}, ${JSON.stringify(planner)}::jsonb, NOW())
        ON CONFLICT (id) DO NOTHING
      `;
      sendJson(res, 200, { created: true, planner });
    } catch {
      sendJson(res, 500, { error: "Could not load shared schedule." });
    }
    return;
  }

  if (req.method === "PUT") {
    try {
      await ensurePlannerTable(sql);
      const planner = normalizePlanner(await readRequestJson(req));
      await sql`
        INSERT INTO office_planner (id, data, updated_at)
        VALUES (${PLANNER_ID}, ${JSON.stringify(planner)}::jsonb, NOW())
        ON CONFLICT (id)
        DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()
      `;
      sendJson(res, 200, { planner });
    } catch {
      sendJson(res, 400, { error: "Could not save schedule." });
    }
    return;
  }

  res.setHeader("Allow", "GET, PUT, OPTIONS");
  sendJson(res, 405, { error: "Method not allowed." });
}
