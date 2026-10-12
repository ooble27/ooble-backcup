import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { fetchCached, peek } from "@/lib/adminCache";
import { createPortal } from "react-dom";
import { ArrowRight, Search, ShoppingCart, User, X } from "lucide-react";
import { fetchClientDirectory, type ClientDirectoryEntry } from "@/lib/adminClient";
import { nfCad, STATUS_META, TYPE_META, type AdminOrder } from "@/lib/adminOrders";
import { C, FONT } from "./adminTheme";

/**
 * Recherche universelle (⌘K) : aller à une page, ouvrir une commande
 * (référence, client, montant) ou une fiche client (nom, courriel).
 */

interface NavEntry { id: string; label: string; group: string; icon: React.ElementType }

type Result =
  | { kind: "nav"; key: string; item: NavEntry }
  | { kind: "order"; key: string; order: AdminOrder }
  | { kind: "client"; key: string; client: ClientDirectoryEntry };

const PAL_CSS = `
@keyframes pal-in { from { opacity: 0; transform: translateY(-6px) scale(.985); } to { opacity: 1; transform: none; } }
.pal-veil { position: absolute; inset: 0; background: rgba(10,10,12,.32); -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px); animation: ui-fade .18s ease; }
.pal-box { position: absolute; left: 0; right: 0; margin-inline: auto; top: calc(var(--a-top, env(safe-area-inset-top, 0px)) + min(12vh, 110px));
  width: min(640px, calc(100vw - 32px)); display: flex; flex-direction: column; overflow: hidden;
  background: var(--a-l1); border-radius: 22px; box-shadow: 0 0 0 1px var(--a-bds); animation: pal-in .24s cubic-bezier(.22,1,.36,1); }
.pal-head { display: flex; align-items: center; gap: 10px; padding: 14px 14px 6px; }
.pal-well { flex: 1; min-width: 0; display: flex; align-items: center; gap: 10px; height: 52px; padding: 0 12px 0 16px; border-radius: 15px; background: var(--a-hover2); cursor: text; }
.pal-input { -webkit-appearance: none; appearance: none; flex: 1; min-width: 0; height: 100%; border: none; outline: none; background: transparent; color: var(--a-t1); font-family: inherit; font-size: 17px; letter-spacing: -0.01em; }
.pal-input::placeholder { color: var(--a-t3); }
.pal-input::-webkit-search-cancel-button { display: none; }
.pal-clear { width: 24px; height: 24px; border-radius: 99px; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; background: var(--a-hover4); color: var(--a-t2); flex-shrink: 0; }
.pal-esc, .pal-k { font-family: inherit; font-size: 11px; padding: 2px 7px; border-radius: 6px; background: var(--a-l1); color: var(--a-t3); box-shadow: 0 0 0 1px var(--a-bds); }
.pal-k { margin-right: 4px; }
.pal-cancel { display: none; border: none; background: transparent; color: var(--a-t1); font-family: inherit; font-size: 15px; cursor: pointer; padding: 0 2px; }
.pal-body { height: min(58vh, 460px); overflow-y: auto; overscroll-behavior: contain; padding: 6px 14px 10px; }
.pal-hint { margin: 6px 4px 12px; font-size: 13px; line-height: 1.5; color: var(--a-t3); }
.pal-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(112px, 1fr)); gap: 6px; }
.pal-tile { display: flex; flex-direction: column; align-items: flex-start; gap: 10px; padding: 12px; min-height: 84px; border-radius: 14px; border: none; cursor: pointer;
  background: transparent; color: var(--a-t1); font-family: inherit; text-align: left; transition: background .15s; }
.pal-tile[data-on="true"] { background: var(--a-hover2); }
.pal-ico { width: 36px; height: 36px; border-radius: 99px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; background: var(--a-hover2); color: var(--a-t2); transition: background .15s, color .15s; }
.pal-tile[data-on="true"] .pal-ico, .pal-row[data-on="true"] .pal-ico { background: var(--a-t1); color: var(--a-bg); }
.pal-group { margin: 8px 4px 6px; font-size: 12px; color: var(--a-t3); }
.pal-row { width: 100%; display: flex; align-items: center; gap: 12px; padding: 9px 10px; border-radius: 14px; border: none; cursor: pointer;
  background: transparent; color: var(--a-t1); font-family: inherit; text-align: left; transition: background .15s; }
.pal-row[data-on="true"] { background: var(--a-hover2); }
.pal-go { color: var(--a-t3); opacity: 0; transform: translateX(-4px); transition: opacity .15s, transform .2s; flex-shrink: 0; }
.pal-row[data-on="true"] .pal-go { opacity: 1; transform: none; }
.pal-foot { display: flex; gap: 16px; align-items: center; padding: 10px 18px 14px; font-size: 12px; color: var(--a-t3); }
/* Téléphone : la recherche occupe tout l'écran, comme celle du système. */
@media (max-width: 640px) {
  .pal-box { inset: 0; top: 0; width: 100%; height: 100%; border-radius: 0; box-shadow: none; background: var(--a-bg); padding-top: var(--a-top, env(safe-area-inset-top, 0px)); animation: ui-fade .18s ease; }
  .pal-esc, .pal-foot { display: none; }
  .pal-cancel { display: block; }
  .pal-head { padding: 10px 14px 6px 16px; }
  .pal-well { height: 46px; border-radius: 13px; }
  .pal-input { font-size: 16px; }
  .pal-body { flex: 1; height: auto; padding: 6px 12px calc(16px + env(safe-area-inset-bottom, 0px)); }
  .pal-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .pal-tile { align-items: center; text-align: center; min-height: 92px; padding: 12px 6px; }
}
@media (prefers-reduced-motion: reduce) { .pal-box, .pal-veil { animation: none; } }
`;

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export default function CommandPalette({ nav, orders, onClose, onTab, onOrder, onClient, canSeeClients }: {
  nav: NavEntry[]; orders: AdminOrder[]; onClose: () => void;
  onTab: (id: string) => void; onOrder: (o: AdminOrder) => void; onClient: (id: string, name: string) => void; canSeeClients: boolean;
}) {
  const [q, setQ] = useState("");
  const [index, setIndex] = useState(0);
  const [clients, setClients] = useState<ClientDirectoryEntry[] | null>(() => peek<ClientDirectoryEntry[]>("clients.directory2000")?.value ?? null);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);

  // Focus pendant le même toucher que l'ouverture : iPhone et iPad n'ouvrent le clavier qu'à cette condition.
  useLayoutEffect(() => { input.current?.focus({ preventScroll: true }); }, []);
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    if (canSeeClients) fetchCached("clients.directory2000", () => fetchClientDirectory(2000)).then(setClients).catch(() => setClients((c) => c ?? []));
    return () => { document.body.style.overflow = prev; };
  }, [canSeeClients]);

  const results = useMemo<{ title: string; items: Result[] }[]>(() => {
    const s = norm(q.trim());
    const navHits = nav.filter((n) => !s || norm(`${n.label} ${n.group}`).includes(s)).map<Result>((item) => ({ kind: "nav", key: `n:${item.id}`, item }));
    if (!s) return [{ title: "Aller à", items: navHits }];
    const orderHits = orders
      .filter((o) => norm(`${o.ref} ${o.clientName} ${o.clientEmail} ${Math.round(o.cad)}`).includes(s))
      .slice(0, 6)
      .map<Result>((order) => ({ kind: "order", key: `o:${order.id}`, order }));
    const clientHits = (clients ?? [])
      .filter((c) => norm(`${c.fullName} ${c.email}`).includes(s))
      .slice(0, 6)
      .map<Result>((client) => ({ kind: "client", key: `c:${client.id}`, client }));
    return [
      { title: "Pages", items: navHits },
      { title: "Commandes", items: orderHits },
      { title: "Clients", items: clientHits },
    ].filter((g) => g.items.length);
  }, [q, nav, orders, clients]);

  const flat = results.flatMap((g) => g.items);
  useEffect(() => setIndex(0), [q]);
  useEffect(() => {
    list.current?.querySelector(`[data-i="${index}"]`)?.scrollIntoView({ block: "nearest" });
  }, [index]);

  const choose = (r: Result | undefined) => {
    if (!r) return;
    if (r.kind === "nav") onTab(r.item.id);
    if (r.kind === "order") onOrder(r.order);
    if (r.kind === "client") onClient(r.client.id, r.client.fullName);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { e.preventDefault(); onClose(); }
    if (e.key === "ArrowDown") { e.preventDefault(); setIndex((i) => Math.min(flat.length - 1, i + 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setIndex((i) => Math.max(0, i - 1)); }
    if (e.key === "Enter") { e.preventDefault(); choose(flat[index]); }
  };

  // Met en avant la partie du texte qui correspond à la recherche.
  const mark = (text: string) => {
    const s = q.trim();
    const at = s ? text.toLowerCase().indexOf(s.toLowerCase()) : -1;
    if (at < 0) return text;
    return <>{text.slice(0, at)}<b style={{ fontWeight: 600, color: C.t1 }}>{text.slice(at, at + s.length)}</b>{text.slice(at + s.length)}</>;
  };

  let i = -1;
  const browsing = !q.trim();
  return createPortal(
    <div className="admin-scope" style={{ position: "fixed", inset: 0, zIndex: 2147482800, fontFamily: FONT, color: C.t1 }} onKeyDown={onKey}>
      <style>{PAL_CSS}</style>
      <div onClick={onClose} className="a-veil pal-veil" />
      <div role="dialog" aria-modal="true" aria-label="Recherche" className="pal-box">
        <div className="pal-head">
          <label className="pal-well">
            <Search style={{ width: 18, height: 18, color: C.t3, flexShrink: 0 }} strokeWidth={1.9} />
            {/* Champ de recherche, pas un formulaire : Safari ne propose ni contact ni adresse à préremplir. */}
            <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher dans Ooble" aria-label="Recherche dans le back-office"
              type="search" name="ooble-admin-search" autoFocus autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false} enterKeyHint="go"
              data-1p-ignore data-lpignore="true" data-form-type="other" className="pal-input" />
            {q && <button type="button" className="pal-clear" aria-label="Effacer" onClick={() => { setQ(""); input.current?.focus(); }}><X style={{ width: 14, height: 14 }} strokeWidth={2.2} /></button>}
            <kbd className="pal-esc">Échap</kbd>
          </label>
          <button type="button" className="pal-cancel" onClick={onClose}>Annuler</button>
        </div>

        <div ref={list} className="pal-body">
          {browsing ? (
            <>
              <p className="pal-hint">Une référence <span style={{ color: C.t2 }}>OOB-…</span>, un nom, un courriel ou un montant. Ou allez directement à une page :</p>
              <div className="pal-grid">
                {(results[0]?.items ?? []).map((r) => {
                  if (r.kind !== "nav") return null;
                  i += 1;
                  const me = i;
                  const Icon = r.item.icon;
                  return (
                    <button key={r.key} type="button" data-i={me} data-on={me === index} className="pal-tile" onMouseMove={() => setIndex(me)} onClick={() => choose(r)}>
                      <span className="pal-ico"><Icon style={{ width: 18, height: 18 }} strokeWidth={1.7} /></span>
                      <span style={{ fontSize: 13, lineHeight: 1.25 }}>{r.item.label}</span>
                    </button>
                  );
                })}
              </div>
            </>
          ) : flat.length === 0 ? (
            <div style={{ padding: "48px 12px", textAlign: "center" }}>
              <Search style={{ width: 22, height: 22, color: C.t3 }} strokeWidth={1.6} />
              <p style={{ margin: "10px 0 0", fontSize: 14, color: C.t1 }}>{clients === null && canSeeClients ? "Recherche…" : "Aucun résultat"}</p>
              {!(clients === null && canSeeClients) && <p style={{ margin: "4px 0 0", fontSize: 13, color: C.t3 }}>Rien ne correspond à « {q} ».</p>}
            </div>
          ) : results.map((g) => (
            <div key={g.title} style={{ marginBottom: 10 }}>
              <p className="pal-group">{g.title}</p>
              {g.items.map((r) => {
                i += 1;
                const on = i === index;
                const me = i;
                let icon: React.ReactNode; let main: React.ReactNode; let sub: React.ReactNode = null; let right: React.ReactNode = null;
                if (r.kind === "nav") {
                  const Icon = r.item.icon;
                  icon = <Icon style={{ width: 17, height: 17 }} strokeWidth={1.7} />;
                  main = mark(r.item.label); sub = r.item.group || null;
                } else if (r.kind === "order") {
                  icon = <ShoppingCart style={{ width: 17, height: 17 }} strokeWidth={1.7} />;
                  main = <>{TYPE_META[r.order.type].label} {mark(r.order.ref)} · {mark(r.order.clientName)}</>;
                  sub = STATUS_META[r.order.status].label;
                  right = `${nfCad.format(r.order.cad)} $`;
                } else {
                  icon = <User style={{ width: 17, height: 17 }} strokeWidth={1.7} />;
                  main = mark(r.client.fullName); sub = mark(r.client.email);
                }
                return (
                  <button key={r.key} type="button" data-i={me} data-on={on} className="pal-row" onMouseMove={() => setIndex(me)} onClick={() => choose(r)}>
                    <span className="pal-ico">{icon}</span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: "block", fontSize: 14, color: C.t2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{main}</span>
                      {sub && <span style={{ display: "block", marginTop: 1, fontSize: 12.5, color: C.t3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sub}</span>}
                    </span>
                    {right && <span style={{ fontSize: 13, color: C.t1, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{right}</span>}
                    <ArrowRight className="pal-go" style={{ width: 15, height: 15 }} />
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        <div className="pal-foot">
          <span><kbd className="pal-k">↑</kbd><kbd className="pal-k">↓</kbd> choisir</span>
          <span><kbd className="pal-k">Entrée</kbd> ouvrir</span>
          <span style={{ marginLeft: "auto" }}><kbd className="pal-k">⌘K</kbd> partout</span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
