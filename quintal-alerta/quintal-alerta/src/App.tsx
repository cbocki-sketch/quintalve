import { useCallback, useEffect, useState } from "react";
import type { PublicStatus } from "../netlify/lib/types";

const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const standalone = (navigator as unknown as { standalone?: boolean }).standalone === true || matchMedia("(display-mode: standalone)").matches;
const pushSupported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

const toKey = (b64: string) => {
  const raw = atob((b64 + "=".repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};
const clock = (t: number) => new Date(t).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
const post = (url: string, body?: unknown) =>
  fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });

export default function App() {
  const [st, setSt] = useState<PublicStatus | null>(null);
  const [active, setActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [now, setNow] = useState(Date.now());
  const [offline, setOffline] = useState(false);

  const load = useCallback(async () => {
    try {
      setSt(await (await fetch("/api/status")).json());
      setOffline(false);
    } catch { setOffline(true); }
  }, []);

  useEffect(() => {
    load();
    const a = setInterval(load, 30_000), b = setInterval(() => setNow(Date.now()), 1000);
    return () => { clearInterval(a); clearInterval(b); };
  }, [load]);

  // Descobre se este aparelho já está inscrito e reenvia a inscrição (idempotente) para manter o servidor em dia
  useEffect(() => {
    if (!pushSupported) return;
    navigator.serviceWorker.ready.then(async (reg) => {
      const sub = await reg.pushManager.getSubscription();
      const on = !!sub && Notification.permission === "granted";
      setActive(on);
      if (on) post("/api/subscribe", sub).catch(() => {});
    });
  }, []);

  const verify = async () => {
    setBusy(true); setNote("");
    try { setSt(await (await post("/api/refresh")).json()); setOffline(false); }
    catch { setOffline(true); }
    setBusy(false);
  };

  const toggle = async () => {
    setNote("");
    if (!pushSupported || (isIOS && !standalone)) {
      setNote("No iPhone: toque em Compartilhar → Adicionar à Tela de Início, abra o Quintal Alerta por esse ícone e ative o monitoramento.");
      return;
    }
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const cur = await reg.pushManager.getSubscription();
      if (active && cur) {
        await post("/api/unsubscribe", { endpoint: cur.endpoint });
        await cur.unsubscribe();
        setActive(false);
      } else {
        if ((await Notification.requestPermission()) !== "granted") {
          setNote("Notificações bloqueadas. Libere em Ajustes → Notificações → Quintal Alerta.");
        } else {
          const key = st?.vapidPublicKey;
          if (!key) throw new Error("Servidor sem chave de notificação (VAPID).");
          const sub = cur ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(key) }));
          const r = await post("/api/subscribe", sub);
          if (!r.ok) throw new Error("Não foi possível registrar este aparelho.");
          setActive(true);
        }
      }
    } catch (e) { setNote(e instanceof Error ? e.message : "Erro ao alterar o monitoramento."); }
    setBusy(false);
  };

  const events = st?.events ?? [];
  const open = events.filter((e) => e.available);
  const next = st?.lastCheck ? st.lastCheck + st.intervalMs : null;
  const left = next ? Math.max(0, Math.round((next - now) / 1000)) : null;
  const nextTxt = left === null ? "—" : left > 0 ? `em ${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}` : "em instantes";

  return (
    <main>
      <header>
        <span className="brand">
          <img src="https://quintalbutia.com.br/wp-content/uploads/2023/09/Logo_S_Fundo-150x150.png" alt="" onError={(e) => (e.currentTarget.style.display = "none")} />
          Quintal Butiá
        </span>
        <span className={`pill ${active ? "on" : ""}`}><i />{active ? "ATIVO" : "PAUSADO"}</span>
      </header>

      <h1>QUINTAL ALERTA</h1>

      {open.length ? (
        <section className="hit" aria-live="polite">
          <h2>🎟️ INGRESSOS DISPONÍVEIS!</h2>
          {open.map((e) => (
            <article key={e.url}>
              <h3>{e.title}</h3>
              <p>{[e.date, e.lotes].filter(Boolean).join(" — ")}</p>
              <a className="cta" href={e.url} target="_blank" rel="noopener noreferrer">ACESSAR INGRESSOS</a>
            </article>
          ))}
        </section>
      ) : (
        <section className="idle" aria-live="polite">
          <h2>{st ? "Nenhum ingresso à venda agora" : "Carregando…"}</h2>
          {st && <p>{events.length ? `${events.length} evento(s) na agenda, sem vendas abertas.` : "Nenhum evento publicado na agenda."}</p>}
        </section>
      )}

      {(st?.lastError || offline) && (
        <p className="warn">{offline ? "Sem conexão com o servidor." : st?.lastError} Nenhum alerta falso é enviado nesses casos.</p>
      )}

      <dl>
        <div><dt>Última verificação</dt><dd>{st?.lastCheck ? clock(st.lastCheck) : "—"}</dd></div>
        <div><dt>Próxima verificação</dt><dd>{nextTxt}</dd></div>
      </dl>

      <div className="actions">
        <button className="primary" onClick={verify} disabled={busy}>{busy ? "VERIFICANDO…" : "VERIFICAR AGORA"}</button>
        <button className="ghost" onClick={toggle} disabled={busy}>{active ? "DESATIVAR MONITORAMENTO" : "ATIVAR MONITORAMENTO"}</button>
      </div>
      {note && <p className="note" role="status">{note}</p>}
    </main>
  );
}
