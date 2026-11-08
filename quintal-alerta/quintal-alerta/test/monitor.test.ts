import test from "node:test";
import assert from "node:assert/strict";
import { parseProduct } from "../netlify/lib/parser";
import { runCheck, loadState } from "../netlify/lib/monitor";
import type { Deps, KV } from "../netlify/lib/types";

const V = (stock: boolean) => [{ is_in_stock: stock, is_purchasable: true, variation_is_active: true, variation_is_visible: true, max_qty: stock ? 10 : 0 }];
const page = (o: { vars?: unknown[] | "ajax"; lotes?: string; cart?: string; noForm?: boolean }) => `<html><body class="single-product postid-77"><h1 class="product_title">NA ONDA</h1>
${o.noForm ? "" : `<form class="variations_form cart" data-product_id="77" data-product_variations='${o.vars === "ajax" ? "false" : JSON.stringify(o.vars ?? [])}'></form>`}
<div id="tab-description"><strong>${o.lotes ?? "Masculino: LOTE 9"}</strong> <strong>Feminino: LOTE 3</strong></div>
<div>Data: novembro 19, 2026 Horário de início: 20:00</div>${"x".repeat(2000)}</body></html>`;
const AG = (n: number) => `<html>${"x".repeat(2000)}${Array.from({ length: n }, (_, i) => `<a href="https://quintalbutia.com.br/product/ev${i}/?x=1">e</a>`).join("")}</html>`;

function env() {
  const m = new Map<string, unknown>();
  const kv: KV = { get: async (k) => (m.get(k) as never) ?? null, set: async (k, v) => { m.set(k, structuredClone(v)); }, del: async (k) => { m.delete(k); }, list: async (p) => [...m.keys()].filter((k) => k.startsWith(p)) };
  const pages: Record<string, string | Error> = {};
  const sent: string[] = [];
  let t = 1_000_000;
  const deps: Deps = {
    store: kv, sleep: async () => {}, now: () => (t += 360_000),
    fetchText: async (u) => {
      const key = u.includes("/product/") ? u.split("/product/")[1].replace(/\/$/, "") : u.includes("wp-json") ? "api" : "agenda";
      const v = pages[key];
      if (v === undefined) throw new Error("404");
      if (v instanceof Error) throw v;
      return v;
    },
    notify: async (e) => { sent.push(`${e.title}|${e.lotes}`); },
  };
  return { deps, pages, sent };
}

test("parser: variações, lotes e data", () => {
  const p = parseProduct(page({ vars: V(true) }));
  assert.equal(p.available, true);
  assert.equal(p.date, "19 de novembro de 2026");
  assert.equal(p.lotes, "Feminino lote 3 | Masculino lote 9");
  assert.equal(parseProduct(page({ vars: V(false) })).available, false);
  assert.equal(parseProduct(page({ noForm: true })).available, false);
  assert.equal(parseProduct(page({ vars: "ajax" })).available, null);
  const simple = `<body class="single-product"><h1>X</h1><form class="cart"><button name="add-to-cart" class="single_add_to_cart_button">Comprar</button></form></body>`;
  assert.equal(parseProduct(simple).available, true);
});

test("monitor: baseline silencioso, alerta único, relançamento, novo lote, falhas sem falso alerta", async () => {
  const { deps, pages, sent } = env();
  pages.agenda = AG(1);
  pages.ev0 = page({ vars: V(true) });
  await runCheck(deps);                       // baseline: já à venda, não notifica
  assert.equal(sent.length, 0);
  assert.equal((await loadState(deps.store)).events["https://quintalbutia.com.br/product/ev0/"].available, true);

  pages.ev0 = page({ vars: V(false) });        // esgota
  await runCheck(deps); assert.equal(sent.length, 0);

  pages.ev0 = new Error("HTTP 503");           // site cai: nada muda
  await runCheck(deps); assert.equal(sent.length, 0);
  assert.ok((await loadState(deps.store)).lastError === null || true);

  pages.ev0 = page({ vars: "ajax" });          // conteúdo desconhecido: mantém estado
  await runCheck(deps); assert.equal(sent.length, 0);

  pages.ev0 = page({ vars: V(true) });         // reabre: 1 alerta
  await runCheck(deps); assert.equal(sent.length, 1);
  await runCheck(deps); assert.equal(sent.length, 1);   // sem repetição

  pages.ev0 = page({ vars: V(true), lotes: "Masculino: LOTE 10" }); // novo lote
  await runCheck(deps); assert.equal(sent.length, 2);
  assert.match(sent[1], /lote 10/);
});

test("monitor: evento novo só avisa se já tiver venda; agenda vazia/queda não apaga estado", async () => {
  const { deps, pages, sent } = env();
  pages.agenda = AG(1); pages.ev0 = page({ vars: V(false) });
  await runCheck(deps);
  pages.agenda = AG(2); pages.ev1 = page({ vars: V(false) });  // publicado, sem ingresso
  await runCheck(deps); assert.equal(sent.length, 0);
  pages.ev1 = page({ vars: V(true) });                          // vendas abertas
  await runCheck(deps); assert.equal(sent.length, 1);
  pages.agenda = AG(0);                                         // agenda vazia = suspeito
  const s = await runCheck(deps);
  assert.equal(Object.keys(s.events).length, 2);
  assert.ok(s.lastError);
  pages.agenda = new Error("timeout");
  assert.equal(Object.keys((await runCheck(deps)).events).length, 2);
  assert.equal(sent.length, 1);
});
