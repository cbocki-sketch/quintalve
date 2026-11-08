import type { Config } from "@netlify/functions";
import { timingSafeEqual } from "node:crypto";
import { runCheck } from "../lib/monitor";
import { defaultDeps, json } from "../lib/runtime";

// Chamado pelo agendador externo (cron-job.org) a cada 5 minutos.
export default async (req: Request) => {
  const secret = process.env.CRON_SECRET ?? "";
  const given = req.headers.get("x-cron-key") ?? new URL(req.url).searchParams.get("key") ?? "";
  const a = Buffer.from(given), b = Buffer.from(secret);
  if (!secret || a.length !== b.length || !timingSafeEqual(a, b)) return json({ error: "unauthorized" }, 401);
  const s = await runCheck(defaultDeps());
  const evs = Object.values(s.events);
  return json({ ok: !s.lastError, lastCheck: s.lastCheck, error: s.lastError, events: evs.length, available: evs.filter((e) => e.available).length });
};
export const config: Config = { path: "/api/check" };
