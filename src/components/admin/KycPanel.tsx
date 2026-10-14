import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchCached, peek, put } from "@/lib/adminCache";
import { Check, ChevronLeft, ChevronRight, ScanFace, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useCan } from "@/lib/roles";
import { timeAgo, type KycRequest, type KycStatus } from "@/lib/adminOrders";
import { claimReview, fetchKyc, setKycStatus, getDocumentUrl } from "@/lib/adminKyc";
import { C, FONT } from "./adminTheme";
import { Button, Notice, TextArea, Workspace, WsPane } from "./ui";
import { Avatar, DataTable, EmptyState, FilterChips, Pill, Tabs, TwoLine, type Column, type Tone } from "./layout";
import { KycHero } from "./heroes";
import { Checklist, COMPARE, DocViewer, Section } from "./Dossier";
import BusinessKycPanel from "./BusinessKycPanel";

const STATUS: Record<KycStatus, [string, Tone]> = { attente: ["À vérifier", "warn"], verifie: ["Vérifiée", "ok"], refuse: ["Refusée", "danger"] };
const DOC_LABEL: Record<string, string> = { selfie: "Selfie", id_front: "Recto", id_back: "Verso" };
const DOC_ORDER = ["selfie", "id_front", "id_back"];
const DOC_TYPE: Record<string, string> = { passport: "Passeport", drivers_license: "Permis de conduire", id_card: "Carte d'identité", pr_card: "Carte de résident permanent" };
/** Chaque point à contrôler montre le document qui permet de le vérifier. */
const CHECKS: { text: string; view: string }[] = [
  { text: "Le visage du selfie correspond à la photo de la pièce", view: COMPARE },
  { text: "Le nom correspond à celui du compte", view: "id_front" },
  { text: "La pièce n'est pas expirée", view: "id_front" },
  { text: "Les photos sont nettes et complètes", view: "id_back" },
];
const REASONS = [
  "La photo de la pièce est floue : le texte n'est pas lisible.",
  "La pièce d'identité est expirée.",
  "Le selfie ne correspond pas à la photo de la pièce.",
  "Il manque le verso de la pièce d'identité.",
  "Le nom sur la pièce ne correspond pas à celui du compte.",
];

const dayFmt = new Intl.DateTimeFormat("fr-CA", { day: "numeric", month: "short", year: "numeric" });
const day = (iso?: string | null) => (iso ? dayFmt.format(new Date(iso)) : "");
const ordinal = (n: number) => (n === 1 ? "Premier envoi" : `${n}e envoi`);
const firstName = (name?: string | null) => (name ?? "").split(/[\s@]/)[0];

type Me = { id: string; name: string };

const REVIEW_CSS = `
.kv-title { margin: 6px 0 0; font-size: clamp(30px, 3vw, 42px); line-height: 1.05; font-weight: 600; letter-spacing: -0.045em; color: var(--a-t1); text-wrap: balance; overflow-wrap: anywhere; }
.kv-sub { margin: 14px 0 0; font-size: 14.5px; line-height: 1.6; color: var(--a-t2); }
.kv-sub b { font-weight: 500; color: var(--a-t1); }
.kv-count { font-size: 44px; line-height: 1; font-weight: 600; letter-spacing: -0.05em; font-variant-numeric: tabular-nums; display: inline-block; animation: kv-pop .45s cubic-bezier(.34,1.56,.64,1) both; transition: color .3s; }
@keyframes kv-pop { from { opacity: .3; transform: translateY(6px) scale(.92); } to { opacity: 1; transform: none; } }
.kv-pane > * { animation: kv-in .5s cubic-bezier(.22,1,.36,1) both; }
.kv-pane > *:nth-child(2) { animation-delay: .04s } .kv-pane > *:nth-child(3) { animation-delay: .08s }
.kv-pane > *:nth-child(4) { animation-delay: .12s } .kv-pane > *:nth-child(n+5) { animation-delay: .16s }
@keyframes kv-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) { .kv-pane > *, .kv-count { animation: none; } }
`;

/** Envois du même client avant celui-ci, du plus récent au plus ancien. */
const earlier = (all: KycRequest[], r: KycRequest) => all
  .filter((x) => x.userId && x.userId === r.userId && x.id !== r.id && (x.createdAt ?? "") < (r.createdAt ?? ""))
  .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));

/* ─── Examen d'un dossier, en plein écran ─── */
function Review({ list, all, index, me, canDecide, onIndex, onClose, onDecide, onClaim, onRelease }: {
  list: KycRequest[]; all: KycRequest[]; index: number; me: Me | null; canDecide: boolean;
  onIndex: (i: number) => void; onClose: () => void;
  onDecide: (r: KycRequest, status: KycStatus, reason?: string) => Promise<boolean>;
  onClaim: (r: KycRequest, force?: boolean) => Promise<boolean>; onRelease: (r: KycRequest) => void;
}) {
  const r = list[index];
  const [note, setNote] = useState("");
  const [checks, setChecks] = useState<boolean[]>(CHECKS.map(() => false));
  const [view, setView] = useState<string>(COMPARE);
  const [refusing, setRefusing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setNote(""); setChecks(CHECKS.map(() => false)); setView(COMPARE); setRefusing(false); setError(null); }, [r?.id]);
  const load = useCallback((p: string) => getDocumentUrl(p), []);

  // Ouvrir un dossier, c'est le prendre : les collègues voient qui l'examine. Le fermer le libère.
  const pending = r?.status === "attente";
  useEffect(() => {
    if (!r || !pending || !me || !canDecide) return;
    let mine = r.assignedTo === me.id;
    if (!r.assignedTo) void onClaim(r).then((ok) => { mine = ok; });
    return () => { if (mine) onRelease(r); };
  }, [r?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!r) return null;
  const keys = r.documentPaths ? DOC_ORDER.filter((k) => k in r.documentPaths!) : [];
  const before = earlier(all, r);
  const lastRefusal = before.find((x) => x.status === "refuse");
  const byOther = pending && r.assignedTo && me && r.assignedTo !== me.id;
  const done = checks.filter(Boolean).length;

  // Cocher un point montre le document du point suivant.
  const tick = (next: boolean[]) => {
    setChecks(next);
    const j = next.findIndex((v) => !v);
    if (j >= 0 && next.filter(Boolean).length > checks.filter(Boolean).length) setView(CHECKS[j].view);
  };

  const decide = async (status: KycStatus) => {
    if (status === "refuse" && !note.trim()) { setError("Indiquez au client ce qu'il doit corriger : le motif figure dans son courriel."); return; }
    setBusy(true); setError(null);
    const ok = await onDecide(r, status, status === "refuse" ? note : undefined);
    setBusy(false);
    if (!ok) setError("La décision n'a pas pu être enregistrée. Réessayez.");
  };

  return (
    <Workspace
      title={r.clientName}
      subtitle={`Vérification d'identité · ${DOC_TYPE[r.docType] ?? r.docType ?? "document"}`}
      onClose={onClose}
      panes
      actions={list.length > 1 && (
        <>
          <span style={{ fontSize: 12.5, color: C.t3, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", flexShrink: 0 }}>{index + 1} sur {list.length}</span>
          <Button variant="ghost" size="sm" aria-label="Dossier précédent" disabled={index === 0} onClick={() => onIndex(index - 1)} icon={<ChevronLeft style={{ width: 16, height: 16 }} />} />
          <Button variant="ghost" size="sm" aria-label="Dossier suivant" disabled={index === list.length - 1} onClick={() => onIndex(index + 1)} icon={<ChevronRight style={{ width: 16, height: 16 }} />} />
        </>
      )}
    >
      <style>{REVIEW_CSS}</style>
      <div className="grid flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-10 lg:overflow-hidden" style={{ minHeight: 0 }}>
        {/* La table lumineuse, posée sur le fond : selfie et pièce côte à côte, puis chaque face en grand. */}
        <WsPane flat className="h-[72vh] lg:h-auto" style={{ padding: "4px 12px 16px", overflow: "hidden", display: "flex", flexDirection: "column" }}>
          <DocViewer
            docs={keys.map((k) => ({ key: k, label: DOC_LABEL[k] ?? k, path: r.documentPaths![k] }))}
            compare={{ a: "selfie", b: "id_front", label: "Selfie et pièce" }}
            view={view} onView={setView} load={load}
            empty={<div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}><EmptyState icon={ScanFace} title="Aucun document" text="Ce dossier vient de l'ancien parcours (Sumsub) : aucun fichier n'est stocké chez Ooble." /></div>} />
        </WsPane>

        {/* Aucune boîte : le dossier se lit comme une page, la décision reste en bas. */}
        <WsPane flat style={{ display: "flex", flexDirection: "column", fontFamily: FONT }}>
          <div key={r.id} className="kv-pane" style={{ flex: 1, padding: "8px 20px 20px 16px" }}>
            <p style={{ margin: 0, fontSize: 12.5, color: C.t3 }}>Nom du compte, à retrouver sur la pièce</p>
            <h2 className="kv-title">{r.clientName}</h2>
            <p className="kv-sub">
              {r.status === "attente" && <><span style={{ color: C.sun }}>À vérifier</span> · </>}
              {r.status === "verifie" && <><span style={{ color: C.sage }}>Approuvée</span>{r.reviewedByName ? <> par <b>{r.reviewedByName}</b></> : ""}{r.reviewedAt ? ` le ${day(r.reviewedAt)}` : ""}. </>}
              {r.status === "refuse" && <><span style={{ color: C.coral }}>Refusée</span>{r.reviewedByName ? <> par <b>{r.reviewedByName}</b></> : ""}{r.reviewedAt ? ` le ${day(r.reviewedAt)}` : ""}. </>}
              Pièce envoyée {timeAgo(r.submittedMinsAgo)} : <b>{DOC_TYPE[r.docType] ?? r.docType ?? "document"}</b>, {before.length ? <b>{ordinal(before.length + 1).toLowerCase()}</b> : "premier envoi"}.
              {r.accountCreatedAt ? <> Compte ouvert le {day(r.accountCreatedAt)}.</> : null}
            </p>
            <p style={{ margin: "6px 0 0", fontSize: 13, color: C.t3 }}>{r.email}</p>

            {pending && lastRefusal && (
              <div style={{ marginTop: 28 }}>
                <p style={{ margin: 0, fontSize: 12.5, color: C.coral }}>
                  Refusé la dernière fois{lastRefusal.reviewedAt ? `, le ${day(lastRefusal.reviewedAt)}` : ""}{lastRefusal.reviewedByName ? ` par ${firstName(lastRefusal.reviewedByName)}` : ""}
                </p>
                {lastRefusal.reviewNote && <p style={{ margin: "6px 0 0", fontSize: 15, lineHeight: 1.55, color: C.t1 }}>« {lastRefusal.reviewNote} »</p>}
                <p style={{ margin: "6px 0 0", fontSize: 13, color: C.t3 }}>Vérifiez d'abord que ce point est corrigé.</p>
              </div>
            )}

            {pending ? (
              <>
                {/* Le compte des points vérifiés, en grand : il avance à chaque coche. */}
                <div style={{ marginTop: 34 }}>
                  <p style={{ margin: 0, display: "flex", alignItems: "baseline", gap: 10 }}>
                    <span key={done} className="kv-count" style={{ color: done === CHECKS.length ? C.sage : C.t1 }}>{done}</span>
                    <span style={{ fontSize: 15, color: C.t3 }}>sur {CHECKS.length} points vérifiés</span>
                  </p>
                  <div style={{ marginTop: 8 }}>
                    <Checklist items={CHECKS.map((c) => c.text)} value={checks} onChange={tick} focus={CHECKS.map((c) => c.view === view)} />
                  </div>
                </div>
                {refusing && (
                  <Section title="Motif pour le client" hint="Il figure dans le courriel envoyé au client.">
                    <TextArea rows={3} maxLength={1000} value={note} autoFocus onChange={(e) => setNote(e.target.value)} placeholder="Ce que le client doit corriger." />
                    <div style={{ display: "grid", marginTop: 6 }}>
                      {REASONS.map((t) => (
                        <button key={t} type="button" className="ui-step" onClick={() => setNote(t)}
                          style={{ all: "unset", boxSizing: "border-box", cursor: "pointer", padding: "7px 0", fontSize: 13, lineHeight: 1.45, fontFamily: FONT, color: note === t ? C.t1 : C.t3, fontWeight: note === t ? 500 : 400 }}>
                          {t}
                        </button>
                      ))}
                    </div>
                  </Section>
                )}
              </>
            ) : r.reviewNote ? (
              <div style={{ marginTop: 28 }}>
                <p style={{ margin: 0, fontSize: 12.5, color: C.t3 }}>Motif envoyé au client</p>
                <p style={{ margin: "6px 0 0", fontSize: 15, lineHeight: 1.55, color: C.t1, whiteSpace: "pre-wrap" }}>« {r.reviewNote} »</p>
              </div>
            ) : null}
          </div>

          {pending && canDecide && (
            // Décision toujours à portée de main, en bas du volet.
            <div style={{ position: "sticky", bottom: 0, padding: "14px 20px calc(18px + env(safe-area-inset-bottom, 0px)) 16px", background: C.ground }}>
              {error && <div style={{ marginBottom: 10 }}><Notice tone="err">{error}</Notice></div>}
              {byOther ? (
                <div style={{ display: "grid", gap: 10 }}>
                  <p style={{ margin: 0, fontSize: 13, color: C.t2 }}>{r.assignedName ?? "Un collègue"} examine ce dossier en ce moment.</p>
                  <Button onClick={() => void onClaim(r, true)}>Reprendre le dossier</Button>
                </div>
              ) : refusing ? (
                <div style={{ display: "flex", gap: 8 }}>
                  <Button variant="ghost" disabled={busy} onClick={() => { setRefusing(false); setError(null); }}>Annuler</Button>
                  <Button variant="danger" disabled={busy || !note.trim()} onClick={() => decide("refuse")} icon={<X style={{ width: 15, height: 15 }} />} className="flex-1">Refuser et prévenir le client</Button>
                </div>
              ) : (
                <div style={{ display: "grid", gap: 12 }}>
                <p key={done} style={{ margin: 0, fontSize: 13.5, color: done === CHECKS.length ? C.sage : C.t2, animation: "kv-in .4s cubic-bezier(.22,1,.36,1) both" }}>
                  {done === 0 ? "Regardez les documents et cochez chaque point."
                    : done < CHECKS.length ? `Encore ${CHECKS.length - done} point${CHECKS.length - done > 1 ? "s" : ""} à vérifier.`
                    : "Tout est conforme : vous pouvez approuver."}
                </p>
                <div style={{ display: "flex", gap: 8 }}>
                  <Button variant="danger" disabled={busy} onClick={() => setRefusing(true)} icon={<X style={{ width: 15, height: 15 }} />}>Refuser</Button>
                  <Button variant="primary" disabled={busy} onClick={() => decide("verifie")} icon={<Check style={{ width: 15, height: 15 }} />} className="flex-1">
                    {done === CHECKS.length ? "Approuver" : "Approuver quand même"}
                  </Button>
                </div>
                </div>
              )}
            </div>
          )}
        </WsPane>
      </div>
    </Workspace>
  );
}

/* ─── Particuliers ─── */
const PersonKycPanel = () => {
  const { user } = useAuth();
  const can = useCan();
  const canDecide = can("kyc.decide");
  const me: Me | null = user ? { id: user.id, name: user.name || user.email || "Équipe" } : null;
  const [rows, setRows] = useState<KycRequest[]>(() => peek<KycRequest[]>("kyc")?.value ?? []);
  const [loading, setLoading] = useState(() => !peek("kyc"));
  const [tab, setTab] = useState<KycStatus>("attente");
  const [open, setOpen] = useState<{ ids: string[]; index: number } | null>(null);

  useEffect(() => {
    fetchCached("kyc", fetchKyc).then((r) => { setRows(r); setLoading(false); });
    // En direct : un nouveau dossier arrive, un collègue en prend un ou décide.
    let timer: number | undefined;
    const ch = supabase.channel("admin-kyc")
      .on("postgres_changes", { event: "*", schema: "public", table: "kyc_verifications" }, () => {
        window.clearTimeout(timer);
        timer = window.setTimeout(() => { fetchKyc().then(setRows); }, 400);
      })
      .subscribe();
    return () => { window.clearTimeout(timer); void supabase.removeChannel(ch); };
  }, []);
  useEffect(() => { if (!loading) put("kyc", rows); }, [rows, loading]);

  const patch = (id: string, changes: Partial<KycRequest>) => setRows((prev) => prev.map((x) => (x.id === id ? { ...x, ...changes } : x)));

  const counts = useMemo(() => ({
    attente: rows.filter((r) => r.status === "attente").length,
    verifie: rows.filter((r) => r.status === "verifie").length,
    refuse: rows.filter((r) => r.status === "refuse").length,
  }), [rows]);
  // Même ordre que le tableau : les plus anciennes d'abord.
  const list = rows.filter((r) => r.status === tab).sort((a, b) => b.submittedMinsAgo - a.submittedMinsAgo);
  const reviewList = open ? open.ids.map((id) => rows.find((r) => r.id === id)!).filter(Boolean) : [];

  const claim = async (r: KycRequest, force = false) => {
    if (!me) return false;
    const res = await claimReview("kyc", r.id, me, { force });
    if (res.error || res.taken) { fetchKyc().then(setRows); return false; }
    patch(r.id, { assignedTo: me.id, assignedName: me.name });
    return true;
  };
  const release = (r: KycRequest) => {
    if (!me) return;
    setRows((prev) => prev.map((x) => (x.id === r.id && x.assignedTo === me.id ? { ...x, assignedTo: null, assignedName: null } : x)));
    void claimReview("kyc", r.id, null, { me: me.id });
  };

  // Approuver ou refuser : le client reçoit un courriel dans les deux cas. Puis dossier suivant.
  const decide = async (r: KycRequest, status: KycStatus, reason?: string) => {
    const reviewNote = status === "refuse" ? reason!.trim() : null;
    const res = await setKycStatus(r.id, status, reason, { email: r.email, name: r.clientName });
    if (res.error) { fetchKyc().then(setRows); return false; }
    patch(r.id, { status, reviewNote, assignedTo: null, assignedName: null, reviewedAt: new Date().toISOString(), reviewedByName: me?.name ?? null });
    setOpen((o) => {
      if (!o) return o;
      const next = o.index + 1;
      return next < o.ids.length ? { ...o, index: next } : null;
    });
    return true;
  };

  const who = (r: KycRequest) => (me && r.assignedTo === me.id ? "Vous" : firstName(r.assignedName) || "Un collègue");
  const columns: Column<KycRequest>[] = [
    { key: "client", header: "Client", sort: (r) => r.clientName, render: (r) => <TwoLine lead={<Avatar name={r.clientName} />} primary={r.clientName} secondary={r.email} /> },
    { key: "doc", header: "Document", hideBelow: 800, render: (r) => {
      const n = earlier(rows, r).length + 1;
      return <TwoLine primary={<span style={{ color: C.t2 }}>{DOC_TYPE[r.docType] ?? r.docType ?? "—"}</span>} secondary={n > 1 ? ordinal(n) : undefined} />;
    } },
    { key: "status", header: "Statut", render: (r) => (r.status === "attente" && r.assignedTo
      ? <span style={{ fontSize: 13, color: C.t2 }}>{who(r)} {who(r) === "Vous" ? "l'examinez" : "l'examine"}</span>
      : <Pill tone={STATUS[r.status][1]}>{STATUS[r.status][0]}</Pill>) },
    tab === "attente"
      ? { key: "age", header: "Soumise", align: "right", sort: (r) => r.submittedMinsAgo, hideBelow: 700, render: (r) => <span style={{ color: C.t2 }}>{timeAgo(r.submittedMinsAgo)}</span> }
      : { key: "age", header: "Décision", align: "right", sort: (r) => r.reviewedAt ?? "", hideBelow: 700, render: (r) => (
        <span style={{ color: C.t2 }}>{r.reviewedByName ? `${firstName(r.reviewedByName)} · ` : ""}{day(r.reviewedAt) || timeAgo(r.submittedMinsAgo)}</span>
      ) },
    { key: "go", header: "", align: "right", render: (r) => <Button size="sm" variant={r.status === "attente" ? "primary" : "secondary"} onClick={(e) => { e.stopPropagation(); start(r); }}>{r.status === "attente" ? "Examiner" : "Voir"}</Button> },
  ];
  const start = (r: KycRequest) => {
    const ids = list.map((x) => x.id);
    setOpen({ ids, index: Math.max(0, ids.indexOf(r.id)) });
  };
  // « À la suite » commence par le plus ancien dossier que personne n'examine.
  const firstFree = list.find((r) => !r.assignedTo || r.assignedTo === me?.id) ?? list[0];

  return (
    <div>
      <KycHero noun="identité" loading={loading} waiting={counts.attente} approved={counts.verifie} rejected={counts.refuse}
        oldestMins={counts.attente ? Math.max(...rows.filter((r) => r.status === "attente").map((r) => r.submittedMinsAgo)) : null} />
      <Tabs value={tab} onChange={setTab} items={[
        { id: "attente", label: "À vérifier", count: counts.attente, tone: "warn" },
        { id: "verifie", label: "Vérifiées", count: counts.verifie },
        { id: "refuse", label: "Refusées", count: counts.refuse },
      ]} />
      {tab === "attente" && counts.attente > 1 && canDecide && (
        <div style={{ margin: "14px 0 0" }}>
          <Button variant="primary" size="sm" onClick={() => start(firstFree)}>Examiner les {counts.attente} dossiers à la suite</Button>
        </div>
      )}
      <div style={{ marginTop: 14 }}>
        <DataTable rows={list} columns={columns} rowKey={(r) => r.id} onRowClick={start} initialSort={{ key: "age", dir: "desc" }}
          empty={<EmptyState icon={ScanFace} title={loading ? "Chargement…" : "Aucun dossier ici"} text={tab === "attente" && !loading ? "Toutes les identités sont vérifiées." : undefined} />}
          mobile={(r) => (
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <Avatar name={r.clientName} size={36} />
              <div style={{ flex: 1, minWidth: 0 }}><TwoLine primary={r.clientName} secondary={`${DOC_TYPE[r.docType] ?? r.docType ?? "Document"} · ${timeAgo(r.submittedMinsAgo)}`} /></div>
              {r.status === "attente" && r.assignedTo
                ? <span style={{ fontSize: 12.5, color: C.t3 }}>{who(r)}</span>
                : <Pill tone={STATUS[r.status][1]}>{STATUS[r.status][0]}</Pill>}
            </div>
          )} />
      </div>
      {open && reviewList.length > 0 && (
        <Review list={reviewList} all={rows} index={Math.min(open.index, reviewList.length - 1)} me={me} canDecide={canDecide}
          onIndex={(i) => setOpen({ ...open, index: i })} onClose={() => setOpen(null)} onDecide={decide} onClaim={claim} onRelease={release} />
      )}
    </div>
  );
};

/* ─── Particuliers / Entreprises ─── */
const KycPanel = () => {
  const [kind, setKind] = useState<"person" | "business">("person");
  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <FilterChips value={kind} onChange={setKind} options={[{ id: "person", label: "Particuliers" }, { id: "business", label: "Entreprises" }]} />
      </div>
      {kind === "person" ? <PersonKycPanel /> : <BusinessKycPanel />}
    </div>
  );
};

export default KycPanel;
