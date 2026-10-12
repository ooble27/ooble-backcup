import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchCached, peek, put } from "@/lib/adminCache";
import { Check, ChevronLeft, ChevronRight, ScanFace, X } from "lucide-react";
import { timeAgo, type KycRequest, type KycStatus } from "@/lib/adminOrders";
import { fetchKyc, setKycStatus, getDocumentUrl } from "@/lib/adminKyc";
import { C, FONT } from "./adminTheme";
import { Button, Notice, TextArea, Workspace, WsPane } from "./ui";
import { Avatar, DataTable, EmptyState, FilterChips, Pill, Tabs, TwoLine, type Column, type Tone } from "./layout";
import { KycHero } from "./heroes";
import { Checklist, DocViewer, Section } from "./Dossier";
import BusinessKycPanel from "./BusinessKycPanel";

const STATUS: Record<KycStatus, [string, Tone]> = { attente: ["À vérifier", "warn"], verifie: ["Vérifiée", "ok"], refuse: ["Refusée", "danger"] };
const DOC_LABEL: Record<string, string> = { selfie: "Selfie", id_front: "Pièce d'identité · recto", id_back: "Pièce d'identité · verso" };
const DOC_ORDER = ["selfie", "id_front", "id_back"];
const DOC_TYPE: Record<string, string> = { passport: "Passeport", drivers_license: "Permis de conduire", id_card: "Carte d'identité", pr_card: "Carte de résident permanent" };
const CHECKS = [
  "Le visage du selfie correspond à la photo de la pièce",
  "Le nom correspond à celui du compte",
  "La pièce n'est pas expirée",
  "Les photos sont nettes et complètes",
];
const REASONS = [
  "La photo de la pièce est floue : le texte n'est pas lisible.",
  "La pièce d'identité est expirée.",
  "Le selfie ne correspond pas à la photo de la pièce.",
  "Il manque le verso de la pièce d'identité.",
  "Le nom sur la pièce ne correspond pas à celui du compte.",
];

type Filter = KycStatus;

/* ─── Examen d'un dossier, en plein écran ─── */
function Review({ list, index, onIndex, onClose, onDecide }: {
  list: KycRequest[]; index: number; onIndex: (i: number) => void; onClose: () => void;
  onDecide: (r: KycRequest, status: KycStatus, reason?: string) => Promise<boolean>;
}) {
  const r = list[index];
  const [note, setNote] = useState("");
  const [checks, setChecks] = useState<boolean[]>(CHECKS.map(() => false));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setNote(""); setChecks(CHECKS.map(() => false)); setError(null); }, [r?.id]);
  const load = useCallback((p: string) => getDocumentUrl(p), []);
  if (!r) return null;
  const keys = r.documentPaths ? DOC_ORDER.filter((k) => k in r.documentPaths!) : [];
  const pending = r.status === "attente";

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
      subtitle={`Vérification d'identité · ${DOC_TYPE[r.docType] ?? r.docType ?? "document"} · soumise ${timeAgo(r.submittedMinsAgo)}`}
      onClose={onClose}
      panes
      actions={list.length > 1 && (
        <>
          <span style={{ fontSize: 12.5, color: C.t3, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", flexShrink: 0 }}>{index + 1} / {list.length}</span>
          <Button variant="ghost" size="sm" aria-label="Précédent" disabled={index === 0} onClick={() => onIndex(index - 1)} icon={<ChevronLeft style={{ width: 16, height: 16 }} />} />
          <Button variant="ghost" size="sm" aria-label="Suivant" disabled={index === list.length - 1} onClick={() => onIndex(index + 1)} icon={<ChevronRight style={{ width: 16, height: 16 }} />} />
        </>
      )}
    >
      <div className="grid flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-2 lg:overflow-hidden" style={{ minHeight: 0 }}>
        {/* Les documents en grand, posés sur le fond ; les autres en vignettes dessous. */}
        <WsPane flat className="h-[64vh] lg:h-auto" style={{ padding: "4px 8px 12px", overflow: "hidden", display: "flex", flexDirection: "column" }}>
          <DocViewer docs={keys.map((k) => ({ key: k, label: DOC_LABEL[k] ?? k, path: r.documentPaths![k] }))} load={load}
            empty={<div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}><EmptyState icon={ScanFace} title="Aucun document" text="Ce dossier vient de l'ancien parcours (Sumsub) : aucun fichier n'est stocké chez Ooble." /></div>} />
        </WsPane>

        <WsPane style={{ display: "flex", flexDirection: "column", fontFamily: FONT }}>
          <div style={{ flex: 1, padding: "26px 26px 20px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <Avatar name={r.clientName} size={44} />
              <div style={{ minWidth: 0, flex: 1 }}><TwoLine primary={r.clientName} secondary={r.email} /></div>
              <Pill tone={STATUS[r.status][1]} dot>{STATUS[r.status][0]}</Pill>
            </div>
            <p style={{ margin: "26px 0 0", fontSize: 26, fontWeight: 600, letterSpacing: "-0.04em", lineHeight: 1.05 }}>{DOC_TYPE[r.docType] ?? r.docType ?? "Document"}</p>
            <p style={{ margin: "6px 0 0", fontSize: 13.5, color: C.t3 }}>Soumis {timeAgo(r.submittedMinsAgo)} · {keys.length ? keys.map((k) => (DOC_LABEL[k]?.split(" · ").pop() ?? k).toLowerCase()).join(", ") : "aucun fichier"}</p>

            {pending ? (
              <>
                <Section title="À vérifier">
                  <Checklist items={CHECKS} value={checks} onChange={setChecks} />
                </Section>
                <Section title="Motif pour le client" hint="Obligatoire en cas de refus : il figure dans le courriel envoyé au client.">
                  <TextArea rows={3} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ce que le client doit corriger." />
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
                    {REASONS.map((t) => (
                      <button key={t} type="button" className="ui-btn ui-btn-ghost" onClick={() => setNote(t)}
                        style={{ height: 30, padding: "0 12px", borderRadius: 99, border: "none", background: note === t ? C.t1 : C.hover2, color: note === t ? C.bg : C.t2, fontFamily: FONT, fontSize: 12, cursor: "pointer" }}>
                        {t.split(" : ")[0].replace(/\.$/, "")}
                      </button>
                    ))}
                  </div>
                </Section>
              </>
            ) : r.reviewNote ? (
              <Section title="Motif envoyé au client">
                <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.6, whiteSpace: "pre-wrap", color: C.t2 }}>{r.reviewNote}</p>
              </Section>
            ) : null}
          </div>

          {pending && (
            // Décision toujours à portée de main, en bas du volet.
            <div style={{ position: "sticky", bottom: 0, padding: "14px 26px calc(18px + env(safe-area-inset-bottom, 0px))", background: C.bg }}>
              {error && <div style={{ marginBottom: 10 }}><Notice tone="err">{error}</Notice></div>}
              <div style={{ display: "flex", gap: 8 }}>
                <Button variant="danger" disabled={busy} onClick={() => decide("refuse")} icon={<X style={{ width: 15, height: 15 }} />}>Refuser</Button>
                <Button variant="primary" disabled={busy} onClick={() => decide("verifie")} icon={<Check style={{ width: 15, height: 15 }} />} className="flex-1">
                  {checks.every(Boolean) ? "Approuver" : "Approuver quand même"}
                </Button>
              </div>
            </div>
          )}
        </WsPane>
      </div>
    </Workspace>
  );
}

/* ─── Particuliers ─── */
const PersonKycPanel = () => {
  const [rows, setRows] = useState<KycRequest[]>(() => peek<KycRequest[]>("kyc")?.value ?? []);
  const [loading, setLoading] = useState(() => !peek("kyc"));
  const [tab, setTab] = useState<Filter>("attente");
  const [open, setOpen] = useState<{ ids: string[]; index: number } | null>(null);

  useEffect(() => { fetchCached("kyc", fetchKyc).then((r) => { setRows(r); setLoading(false); }); }, []);
  useEffect(() => { if (!loading) put("kyc", rows); }, [rows, loading]);

  const counts = useMemo(() => ({
    attente: rows.filter((r) => r.status === "attente").length,
    verifie: rows.filter((r) => r.status === "verifie").length,
    refuse: rows.filter((r) => r.status === "refuse").length,
  }), [rows]);
  // Même ordre que le tableau : les plus anciennes d'abord.
  const list = rows.filter((r) => r.status === tab).sort((a, b) => b.submittedMinsAgo - a.submittedMinsAgo);
  const reviewList = open ? open.ids.map((id) => rows.find((r) => r.id === id)!).filter(Boolean) : [];

  // Approuver ou refuser : le client reçoit un courriel dans les deux cas. Puis dossier suivant.
  const decide = async (r: KycRequest, status: KycStatus, reason?: string) => {
    const reviewNote = status === "refuse" ? reason!.trim() : null;
    const res = await setKycStatus(r.id, status, reason, { email: r.email, name: r.clientName });
    if (res.error) { fetchKyc().then(setRows); return false; }
    setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, status, reviewNote } : x)));
    setOpen((o) => {
      if (!o) return o;
      const next = o.index + 1;
      return next < o.ids.length ? { ...o, index: next } : null;
    });
    return true;
  };

  const columns: Column<KycRequest>[] = [
    { key: "client", header: "Client", sort: (r) => r.clientName, render: (r) => <TwoLine lead={<Avatar name={r.clientName} />} primary={r.clientName} secondary={r.email} /> },
    { key: "doc", header: "Document", hideBelow: 800, render: (r) => <span style={{ color: C.t2 }}>{DOC_TYPE[r.docType] ?? r.docType ?? "—"}</span> },
    { key: "status", header: "Statut", render: (r) => <Pill tone={STATUS[r.status][1]} dot>{STATUS[r.status][0]}</Pill> },
    { key: "age", header: "Soumise", align: "right", sort: (r) => r.submittedMinsAgo, hideBelow: 700, render: (r) => <span style={{ color: C.t2 }}>{timeAgo(r.submittedMinsAgo)}</span> },
    { key: "go", header: "", align: "right", render: (r) => <Button size="sm" variant={r.status === "attente" ? "primary" : "secondary"} onClick={(e) => { e.stopPropagation(); start(r); }}>{r.status === "attente" ? "Examiner" : "Voir"}</Button> },
  ];
  const start = (r: KycRequest) => {
    const ids = list.map((x) => x.id);
    setOpen({ ids, index: Math.max(0, ids.indexOf(r.id)) });
  };

  return (
    <div>
      <KycHero noun="identité" loading={loading} waiting={counts.attente} approved={counts.verifie} rejected={counts.refuse}
        oldestMins={counts.attente ? Math.max(...rows.filter((r) => r.status === "attente").map((r) => r.submittedMinsAgo)) : null} />
      <Tabs value={tab} onChange={setTab} items={[
        { id: "attente", label: "À vérifier", count: counts.attente, tone: "warn" },
        { id: "verifie", label: "Vérifiées", count: counts.verifie },
        { id: "refuse", label: "Refusées", count: counts.refuse },
      ]} />
      {tab === "attente" && counts.attente > 1 && (
        <div style={{ margin: "14px 0 0" }}>
          <Button variant="primary" size="sm" onClick={() => start(list[0])}>Examiner les {counts.attente} dossiers à la suite</Button>
        </div>
      )}
      <div style={{ marginTop: 14 }}>
        <DataTable rows={list} columns={columns} rowKey={(r) => r.id} onRowClick={start} initialSort={{ key: "age", dir: "desc" }}
          empty={<EmptyState icon={ScanFace} title={loading ? "Chargement…" : "Aucun dossier ici"} text={tab === "attente" && !loading ? "Toutes les identités sont vérifiées." : undefined} />}
          mobile={(r) => (
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <Avatar name={r.clientName} size={36} />
              <div style={{ flex: 1, minWidth: 0 }}><TwoLine primary={r.clientName} secondary={`${DOC_TYPE[r.docType] ?? r.docType ?? "Document"} · ${timeAgo(r.submittedMinsAgo)}`} /></div>
              <Pill tone={STATUS[r.status][1]} dot>{STATUS[r.status][0]}</Pill>
            </div>
          )} />
      </div>
      {open && reviewList.length > 0 && (
        <Review list={reviewList} index={Math.min(open.index, reviewList.length - 1)} onIndex={(i) => setOpen({ ...open, index: i })} onClose={() => setOpen(null)} onDecide={decide} />
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
