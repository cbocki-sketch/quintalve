import { getStore } from "@netlify/blobs";
import { createHash } from "node:crypto";
import * as webpush from "web-push";
import type { Deps, EventState, KV } from "./types";

const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile Safari/604.1 QuintalAlerta/1.0";

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

export function defaultKV(): KV {
  const st = getStore({ name: "quintal-alerta", consistency: "strong" });
  return {
    get: async <T>(k: string) => ((await st.get(k, { type: "json" })) as T | null) ?? null,
    set: async (k, v) => { await st.setJSON(k, v); },
    del: async (k) => { await st.delete(k); },
    list: async (p) => (await st.list({ prefix: p })).blobs.map((b) => b.key),
  };
}

async function fetchText(url: string): Promise<string> {
  let last: unknown;
  for (let i = 0; i < 2; i++) {
    try {
      const r = await fetch(url, {
        headers: { "user-agent": UA, "accept-language": "pt-BR,pt;q=0.9" },
        signal: AbortSignal.timeout(4500),
        redirect: "follow",
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const t = await r.text();
      const html = (r.headers.get("content-type") ?? "").includes("html");
      if (html && (t.length < 1500 || /Just a moment|cf-chl|Attention Required/i.test(t)))
        throw new Error("página incompleta ou bloqueada");
      return t;
    } catch (e) {
      last = e;
    }
  }
  throw last instanceof Error ? last : new Error(String(last));
}

export const subKey = (endpoint: string) => `subs/${createHash("sha256").update(endpoint).digest("hex")}`;

function configurePush(): boolean {
  const pub = process.env.VAPID_PUBLIC_KEY, priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) { console.error("VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY ausentes"); return false; }
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:contato@example.com", pub, priv);
  return true;
}

/** Envia a um aparelho. Retorna false (e remove) se a assinatura expirou. */
export async function sendTo(kv: KV, key: string, payload: object): Promise<boolean> {
  const sub = await kv.get<webpush.PushSubscription>(key);
  if (!sub || !configurePush()) return false;
  try {
    await webpush.sendNotification(sub, JSON.stringify(payload), { TTL: 3600, urgency: "high" });
    return true;
  } catch (e) {
    const code = (e as { statusCode?: number }).statusCode;
    if (code === 404 || code === 410) await kv.del(key);
    else console.error("push", code, (e as Error).message);
    return false;
  }
}

export function defaultDeps(): Deps {
  const store = defaultKV();
  return {
    store,
    fetchText,
    now: Date.now,
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    notify: async (ev: EventState) => {
      const payload = {
        title: "🎟️ QUINTAL BUTIÁ",
        body: `Ingressos disponíveis!\nEvento: ${ev.title}\nToque para acessar a compra.`,
        url: ev.url,
        tag: ev.url,
      };
      await Promise.all((await store.list("subs/")).map((k) => sendTo(store, k, payload)));
    },
  };
}
