import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { fetchCached, peek } from "@/lib/adminCache";
import { createPortal } from "react-dom";
import { CornerDownLeft, Search, ShoppingCart, User } from "lucide-react";
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

  let i = -1;
  return createPortal(
    <div className="admin-scope" style={{ position: "fixed", inset: 0, zIndex: 2147482800, fontFamily: FONT, color: C.t1 }} onKeyDown={onKey}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: C.overlay, animation: "ui-fade .15s ease" }} />
      <div role="dialog" aria-modal="true" aria-label="Recherche" style={{
        position: "absolute", left: "50%", top: "calc(var(--a-top, env(safe-area-inset-top, 0px)) + min(10vh, 96px))", transform: "translateX(-50%)", width: "min(620px, calc(100vw - 24px))",
        background: C.l1, border: `1px solid ${C.bd}`, borderRadius: 14, boxShadow: C.shadowHeavy, overflow: "hidden", animation: "ui-in .2s cubic-bezier(.22,1,.36,1)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 16px", borderBottom: `1px solid ${C.bds}` }}>
          <Search style={{ width: 17, height: 17, color: C.t3, flexShrink: 0 }} />
          {/* Champ de recherche, pas un formulaire : Safari ne propose ni contact ni adresse à préremplir. */}
          <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Une page, une commande, un client…" aria-label="Recherche dans le back-office"
            type="search" name="ooble-admin-search" autoFocus autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false} enterKeyHint="go"
            data-1p-ignore data-lpignore="true" data-form-type="other"
            style={{ WebkitAppearance: "none", appearance: "none", minWidth: 0, flex: 1, height: 54, border: "none", outline: "none", background: "transparent", color: C.t1, fontFamily: FONT, fontSize: 16 }} />
          <kbd style={{ fontFamily: FONT, fontSize: 11, padding: "2px 6px", borderRadius: 5, border: `1px solid ${C.bds}`, color: C.t3 }}>Échap</kbd>
        </div>
        {/* Hauteur fixe : la fenêtre ne change pas de taille à chaque lettre tapée. */}
        <div ref={list} style={{ height: "min(56vh, 440px)", overflowY: "auto", overscrollBehavior: "contain", padding: 6 }}>
          {flat.length === 0 && (
            <p style={{ margin: 0, padding: "28px 12px", textAlign: "center", fontSize: 13.5, color: C.t3 }}>
              {clients === null && canSeeClients ? "Recherche…" : `Aucun résultat pour « ${q} ».`}
            </p>
          )}
          {results.map((g) => (
            <div key={g.title}>
              <p style={{ margin: "8px 10px 4px", fontSize: 12, color: C.t3 }}>{g.title}</p>
              {g.items.map((r) => {
                i += 1;
                const on = i === index;
                const me = i;
                let icon: React.ReactNode; let main: React.ReactNode; let sub: React.ReactNode = null; let right: React.ReactNode = null;
                if (r.kind === "nav") {
                  const Icon = r.item.icon;
                  icon = <Icon style={{ width: 16, height: 16 }} strokeWidth={1.7} />;
                  main = r.item.label; sub = r.item.group || null;
                } else if (r.kind === "order") {
                  icon = <ShoppingCart style={{ width: 16, height: 16 }} strokeWidth={1.7} />;
                  main = <>{TYPE_META[r.order.type].label} {r.order.ref} · {r.order.clientName}</>;
                  sub = STATUS_META[r.order.status].label;
                  right = `${nfCad.format(r.order.cad)} $`;
                } else {
                  icon = <User style={{ width: 16, height: 16 }} strokeWidth={1.7} />;
                  main = r.client.fullName; sub = r.client.email;
                }
                return (
                  <button key={r.key} type="button" data-i={me} onMouseMove={() => setIndex(me)} onClick={() => choose(r)}
                    style={{
                      width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "9px 10px", borderRadius: 9, border: "none",
                      background: on ? C.l3 : "transparent", color: C.t1, fontFamily: FONT, textAlign: "left", cursor: "pointer",
                    }}>
                    <span style={{ width: 30, height: 30, borderRadius: 8, background: on ? C.l1 : C.l2, color: C.t2, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{icon}</span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: "block", fontSize: 13.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{main}</span>
                      {sub && <span style={{ display: "block", fontSize: 12, color: C.t3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sub}</span>}
                    </span>
                    {right && <span style={{ fontSize: 12.5, color: C.t2, fontVariantNumeric: "tabular-nums" }}>{right}</span>}
                    {on && <CornerDownLeft style={{ width: 14, height: 14, color: C.t3 }} />}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        <div className="hidden sm:flex" style={{ gap: 14, padding: "9px 16px", borderTop: `1px solid ${C.bds}`, fontSize: 12, color: C.t3 }}>
          <span>↑ ↓ pour choisir</span><span>Entrée pour ouvrir</span><span>⌘K partout pour revenir ici</span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
