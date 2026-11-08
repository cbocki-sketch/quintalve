import type { Config } from "@netlify/functions";
import { defaultKV, json, subKey } from "../lib/runtime";

export default async (req: Request) => {
  const b = await req.json().catch(() => null);
  if (typeof b?.endpoint !== "string") return json({ error: "inválido" }, 400);
  await defaultKV().del(subKey(b.endpoint));
  return json({ ok: true });
};
export const config: Config = { path: "/api/unsubscribe", method: "POST" };
