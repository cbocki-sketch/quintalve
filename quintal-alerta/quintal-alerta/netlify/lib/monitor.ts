import { BASE, parseAgenda, parseProduct } from "./parser";
import type { Deps, EventState, KV, PublicStatus, State } from "./types";

export const INTERVAL_MS = 5 * 60_000;
const AGENDA = [`${BASE}/categoria/agenda/`, `${BASE}/`];
const DEDUPE_MS = 30 * 60_000;

const empty = (): State => ({
  seeded: false, lastCheck: null, lastOk: null, lastError: null,
  failures: 0, lockUntil: 0, events: {}, notified: {},
});

export const loadState = async (kv: KV) => (await kv.get<State>("state")) ?? empty();

export async function publicStatus(kv: KV): Promise<PublicStatus> {
  const s = await loadState(kv);
  return {
    now: Date.now(), lastCheck: s.lastCheck, lastOk: s.lastOk, lastError: s.lastError,
    events: Object.values(s.events), intervalMs: INTERVAL_MS,
    vapidPublicKey: process.env.VAPID_PUBLIC_KEY ?? "",
  };
}

type Insp = { url: string; title: string; date: string; lotes: string; available: boolean | null };

async function inspect(d: Deps, url: string): Promise<Insp> {
  const p = parseProduct(await d.fetchText(url));
  let available = p.available;
  // Fallback para conteúdo carregado por JS/AJAX: API pública da loja (WooCommerce Store API)
  if (available === null && p.productId) {
    try {
      const j = JSON.parse(await d.fetchText(`${BASE}/wp-json/wc/store/v1/products/${p.productId}`));
      if (typeof j.is_in_stock === "boolean") available = j.is_in_stock && j.is_purchasable !== false;
    } catch {
      /* sem resposta útil: segue como desconhecido */
    }
  }
  return { url, title: p.title || url, date: p.date, lotes: p.lotes, available };
}

const toEv = (c: Insp, avail: boolean, prev: EventState | undefined, t: number): EventState => ({
  url: c.url, title: c.title, date: c.date, lotes: c.lotes, available: avail,
  since: prev && prev.available === avail ? prev.since : t,
});

async function scan(d: Deps, s: State, t: number) {
  const urls = new Set<string>();
  let ok = false;
  let err = "";
  for (const a of AGENDA) {
    try {
      parseAgenda(await d.fetchText(a)).forEach((u) => urls.add(u));
      ok = true;
      if (urls.size) break;
    } catch (e) {
      err = e instanceof Error ? e.message : String(e);
    }
  }
  if (!ok) throw new Error(`Site indisponível no momento (${err}).`);
  if (!urls.size && Object.keys(s.events).length)
    throw new Error("A agenda veio vazia; ignorado para evitar falso alerta.");

  const list = [...urls];
  const results = await Promise.all(
    list.map(async (url) => {
      const prev = s.events[url];
      try {
        let cur = await inspect(d, url);
        if (cur.available === null) return { url, ev: prev, err: true, alert: false };
        const wasAvail = prev?.available === true;
        let change = cur.available === true && (!wasAvail || prev?.lotes !== cur.lotes);
        if (change) {
          // Confirma antes de avisar: evita falso positivo por página parcial/instável
          await d.sleep(1500);
          const again = await inspect(d, url);
          if (again.available !== true) return { url, ev: prev ?? toEv(cur, false, prev, t), err: true, alert: false };
          cur = again;
          change = !wasAvail || prev?.lotes !== cur.lotes;
        }
        const ev = toEv(cur, cur.available === true, prev, t);
        const n = s.notified[url];
        const recent = !!n && n.sig === ev.lotes && t - n.at < DEDUPE_MS;
        return { url, ev, err: false, alert: change && s.seeded && !recent };
      } catch {
        return { url, ev: prev, err: true, alert: false };
      }
    }),
  );

  const events: Record<string, EventState> = {};
  const notified = { ...s.notified };
  const alerts: EventState[] = [];
  let errors = 0;
  for (const r of results) {
    if (r.ev) events[r.url] = r.ev;
    if (r.err) errors++;
    if (r.alert && r.ev) {
      alerts.push(r.ev);
      notified[r.url] = { sig: r.ev.lotes, at: t };
    }
  }
  const state: State = {
    ...s, seeded: true, events, notified,
    lastOk: errors < list.length || !list.length ? t : s.lastOk,
    lastError: errors ? `${errors} página(s) de evento não puderam ser lidas; mantido o último estado conhecido.` : null,
    failures: errors ? s.failures + 1 : 0,
  };
  return { state, alerts };
}

/** Uma verificação completa. Nunca lança: falhas só atualizam lastError e preservam o estado. */
export async function runCheck(d: Deps, opts: { minGapMs?: number } = {}): Promise<State> {
  let s = await loadState(d.store);
  const t = d.now();
  if (s.lockUntil > t) return s;
  if (opts.minGapMs && s.lastCheck && t - s.lastCheck < opts.minGapMs) return s;
  await d.store.set("state", { ...s, lockUntil: t + 60_000 });

  let alerts: EventState[] = [];
  try {
    const r = await scan(d, s, t);
    s = r.state;
    alerts = r.alerts;
  } catch (e) {
    s = { ...s, lastError: e instanceof Error ? e.message : String(e), failures: s.failures + 1 };
  }
  s = { ...s, lastCheck: t, lockUntil: 0 };
  await d.store.set("state", s); // grava ANTES de notificar: nunca repete o aviso se algo falhar depois
  for (const a of alerts) {
    try { await d.notify(a); } catch (e) { console.error("notify", e); }
  }
  return s;
}
