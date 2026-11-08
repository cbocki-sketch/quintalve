import type { Config } from "@netlify/functions";
import { defaultKV, json, sendTo, subKey } from "../lib/runtime";

export default async (req: Request) => {
  const sub = await req.json().catch(() => null);
  const ep: unknown = sub?.endpoint;
  if (typeof ep !== "string" || !ep.startsWith("https://") || !sub?.keys?.p256dh || !sub?.keys?.auth)
    return json({ error: "assinatura inválida" }, 400);
  const kv = defaultKV();
  const key = subKey(ep);
  const isNew = !(await kv.get(key));
  if (isNew && (await kv.list("subs/")).length >= 20) return json({ error: "limite de aparelhos" }, 429);
  await kv.set(key, { endpoint: ep, keys: sub.keys });
  if (isNew)
    await sendTo(kv, key, { title: "🎟️ QUINTAL ALERTA", body: "Monitoramento ativado. Você será avisado quando houver ingressos.", url: "/", tag: "welcome" });
  return json({ ok: true });
};
export const config: Config = { path: "/api/subscribe", method: "POST" };
