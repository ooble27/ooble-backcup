import { useEffect, useState } from "react";
import { AlertTriangle, Info, Megaphone, Plus, ShieldAlert, Wrench, X } from "lucide-react";
import {
  createAnnouncement, createMaintenance,
  deleteAnnouncement, deleteMaintenance,
  listAnnouncements, listMaintenanceWindows,
  updateAnnouncement, updateMaintenance,
  type Announcement, type AnnouncementDraft, type AnnouncementKind,
  type MaintenanceDraft, type MaintenanceWindow,
} from "@/lib/announcements";
import { C } from "./adminTheme";
import { Button, Field, Notice, SidePanel, Switch, TextArea, TextInput } from "./ui";
import { DataTable, EmptyState, FilterChips, KeyValues, Pill, Tabs, Toolbar, TwoLine, type Column, type Tone } from "./layout";

/*
 * Bannière (message en haut de l'app) et fenêtres de maintenance (écran qui
 * bloque les pages clients ; le back-office reste ouvert). Bilingue FR / EN.
 */

const KIND_META: Record<AnnouncementKind, { icon: typeof Info; label: string; tone: Tone }> = {
  info: { icon: Info, label: "Info", tone: "neutral" },
  warning: { icon: AlertTriangle, label: "Avertissement", tone: "warn" },
  critical: { icon: ShieldAlert, label: "Critique", tone: "danger" },
};

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("fr-CA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "";

// Convertit un ISO UTC vers la valeur locale acceptée par `<input type=datetime-local>`.
function isoToLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function localInputToIso(v: string): string | null {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

const two: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 };
const label: React.CSSProperties = { margin: "0 0 8px", fontSize: 12.5, color: C.t3 };

/** Aperçu de la bannière telle que les clients la voient. */
function BannerPreview({ kind, title, body, dismissible }: { kind: AnnouncementKind; title: string; body: string; dismissible: boolean }) {
  const Icon = KIND_META[kind].icon;
  const tint = kind === "critical" ? { bg: C.dangerBg, fg: C.dangerText } : kind === "warning" ? { bg: C.warnBg, fg: C.warnText } : { bg: C.hover3, fg: C.t1 };
  return (
    <div style={{ borderRadius: 10, border: `1px solid ${C.bds}`, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 12px", background: tint.bg }}>
        <span style={{ width: 22, height: 22, borderRadius: 99, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: tint.fg }}>
          <Icon style={{ width: 14, height: 14 }} strokeWidth={2} />
        </span>
        <div style={{ flex: 1, minWidth: 0, paddingTop: 2 }}>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: C.t1 }}>{title || "Titre de la bannière"}</p>
          {body && <p style={{ margin: "2px 0 0", fontSize: 12.5, lineHeight: 1.45, color: C.t2 }}>{body}</p>}
        </div>
        {dismissible && <X style={{ width: 14, height: 14, marginTop: 4, color: C.t3 }} />}
      </div>
      <div style={{ height: 34, background: C.l1 }} />
    </div>
  );
}

// ─────────────────────── Bannière : éditeur ───────────────────────

const EMPTY_ANN: AnnouncementDraft = { kind: "info", title_fr: "", title_en: "", body_fr: "", body_en: "", dismissible: true, active: true };

function AnnouncementEditor({ initial, onClose, onSaved }: { initial?: Announcement; onClose: () => void; onSaved: () => void }) {
  const [draft, setDraft] = useState<AnnouncementDraft>(initial
    ? { kind: initial.kind, title_fr: initial.title_fr, title_en: initial.title_en, body_fr: initial.body_fr, body_en: initial.body_en, dismissible: initial.dismissible, active: initial.active }
    : EMPTY_ANN);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);
  const patch = (p: Partial<AnnouncementDraft>) => setDraft((d) => ({ ...d, ...p }));
  const valid = !!(draft.title_fr.trim() && draft.title_en.trim());

  const save = async () => {
    if (!valid || busy) return;
    setBusy(true); setErr(null);
    const res = initial ? await updateAnnouncement(initial.id, draft) : await createAnnouncement(draft);
    setBusy(false);
    if (res.error) { setErr(res.error); return; }
    onSaved();
  };
  const remove = async () => {
    if (!initial) return;
    const res = await deleteAnnouncement(initial.id);
    if (res.error) setErr(res.error); else onSaved();
  };

  return (
    <SidePanel title={initial ? "Modifier la bannière" : "Nouvelle bannière"} subtitle="Bilingue FR / EN. Une seule bannière active à la fois." onClose={onClose} width={620}
      footer={<>
        {initial && (confirmDel
          ? <Button variant="danger" size="sm" onClick={remove}>Confirmer la suppression</Button>
          : <Button variant="ghost" size="sm" onClick={() => setConfirmDel(true)}>Supprimer</Button>)}
        <span style={{ flex: 1 }} />
        <Button variant="ghost" onClick={onClose}>Annuler</Button>
        <Button variant="primary" disabled={!valid || busy} onClick={save}>{busy ? "Enregistrement…" : "Enregistrer"}</Button>
      </>}>
      <p style={label}>Aperçu</p>
      <BannerPreview kind={draft.kind} title={draft.title_fr} body={draft.body_fr} dismissible={draft.dismissible} />

      <div style={{ display: "grid", gap: 18, marginTop: 24 }}>
        <div>
          <p style={label}>Type</p>
          <FilterChips value={draft.kind} onChange={(k) => patch({ kind: k })}
            options={(Object.keys(KIND_META) as AnnouncementKind[]).map((k) => ({ id: k, label: KIND_META[k].label }))} />
        </div>
        <div style={two}>
          <Field label="Titre (français)"><TextInput value={draft.title_fr} onChange={(e) => patch({ title_fr: e.target.value })} placeholder="Maintenance planifiée samedi soir" /></Field>
          <Field label="Titre (anglais)"><TextInput value={draft.title_en} onChange={(e) => patch({ title_en: e.target.value })} placeholder="Planned maintenance Saturday evening" /></Field>
        </div>
        <div style={two}>
          <Field label="Texte (français)" right={<span style={{ color: C.t3 }}>Facultatif</span>}><TextArea rows={3} value={draft.body_fr} onChange={(e) => patch({ body_fr: e.target.value })} /></Field>
          <Field label="Texte (anglais)" right={<span style={{ color: C.t3 }}>Facultatif</span>}><TextArea rows={3} value={draft.body_en} onChange={(e) => patch({ body_en: e.target.value })} /></Field>
        </div>
        <div style={{ display: "grid", gap: 16, paddingTop: 18, borderTop: `1px solid ${C.bds}` }}>
          <Switch checked={draft.dismissible} onChange={(v) => patch({ dismissible: v })} label="Les clients peuvent la fermer" hint="Leur choix est mémorisé." />
          <Switch checked={draft.active} onChange={(v) => patch({ active: v })} label="Publier tout de suite" hint="Toute autre bannière active sera désactivée." />
        </div>
        {err && <Notice tone="err">{err}</Notice>}
      </div>
    </SidePanel>
  );
}

// ─────────────────────── Maintenance : éditeur ───────────────────────

const EMPTY_MAINT: MaintenanceDraft = {
  title_fr: "Maintenance en cours",
  title_en: "Maintenance in progress",
  body_fr: "Nous améliorons Ooble. Réessayez dans quelques minutes.",
  body_en: "We're improving Ooble. Please try again in a few minutes.",
  starts_at: null,
  ends_at: null,
  active: true,
};

function MaintenanceEditor({ initial, onClose, onSaved }: { initial?: MaintenanceWindow; onClose: () => void; onSaved: () => void }) {
  const [draft, setDraft] = useState<MaintenanceDraft>(initial
    ? { title_fr: initial.title_fr, title_en: initial.title_en, body_fr: initial.body_fr, body_en: initial.body_en, starts_at: initial.starts_at, ends_at: initial.ends_at, active: initial.active }
    : EMPTY_MAINT);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);
  const patch = (p: Partial<MaintenanceDraft>) => setDraft((d) => ({ ...d, ...p }));
  const valid = !!(draft.title_fr.trim() && draft.title_en.trim());

  const save = async () => {
    if (!valid || busy) return;
    setBusy(true); setErr(null);
    const res = initial ? await updateMaintenance(initial.id, draft) : await createMaintenance(draft);
    setBusy(false);
    if (res.error) { setErr(res.error); return; }
    onSaved();
  };
  const remove = async () => {
    if (!initial) return;
    const res = await deleteMaintenance(initial.id);
    if (res.error) setErr(res.error); else onSaved();
  };

  return (
    <SidePanel title={initial ? "Modifier la maintenance" : "Planifier une maintenance"} subtitle="Bloque les pages clients. Le back-office reste accessible." onClose={onClose} width={620}
      footer={<>
        {initial && (confirmDel
          ? <Button variant="danger" size="sm" onClick={remove}>Confirmer la suppression</Button>
          : <Button variant="ghost" size="sm" onClick={() => setConfirmDel(true)}>Supprimer</Button>)}
        <span style={{ flex: 1 }} />
        <Button variant="ghost" onClick={onClose}>Annuler</Button>
        <Button variant="primary" disabled={!valid || busy} onClick={save}>{busy ? "Enregistrement…" : "Enregistrer"}</Button>
      </>}>
      <div style={{ display: "grid", gap: 18 }}>
        <div style={two}>
          <Field label="Début" hint="Vide : commence tout de suite.">
            <TextInput type="datetime-local" value={isoToLocalInput(draft.starts_at)} onChange={(e) => patch({ starts_at: localInputToIso(e.target.value) })} />
          </Field>
          <Field label="Fin prévue" hint="Facultatif, affichée aux clients.">
            <TextInput type="datetime-local" value={isoToLocalInput(draft.ends_at)} onChange={(e) => patch({ ends_at: localInputToIso(e.target.value) })} />
          </Field>
        </div>
        <div style={two}>
          <Field label="Titre (français)"><TextInput value={draft.title_fr} onChange={(e) => patch({ title_fr: e.target.value })} /></Field>
          <Field label="Titre (anglais)"><TextInput value={draft.title_en} onChange={(e) => patch({ title_en: e.target.value })} /></Field>
        </div>
        <div style={two}>
          <Field label="Message (français)"><TextArea rows={3} value={draft.body_fr} onChange={(e) => patch({ body_fr: e.target.value })} /></Field>
          <Field label="Message (anglais)"><TextArea rows={3} value={draft.body_en} onChange={(e) => patch({ body_en: e.target.value })} /></Field>
        </div>
        <div style={{ paddingTop: 18, borderTop: `1px solid ${C.bds}` }}>
          <Switch checked={draft.active} onChange={(v) => patch({ active: v })} label="Activer cette maintenance"
            hint="L'écran de maintenance s'affiche tant qu'elle est active, dans les dates prévues." />
        </div>
        {err && <Notice tone="err">{err}</Notice>}
      </div>
    </SidePanel>
  );
}

// ─────────────────────── Panneau principal ───────────────────────

type SubTab = "banner" | "maintenance";

type EditState =
  | { kind: "none" }
  | { kind: "ann"; item?: Announcement }
  | { kind: "mnt"; item?: MaintenanceWindow };

const AnnouncementsPanel = () => {
  const [tab, setTab] = useState<SubTab>("banner");
  const [anns, setAnns] = useState<Announcement[]>([]);
  const [mnts, setMnts] = useState<MaintenanceWindow[]>([]);
  const [loading, setLoading] = useState(true);
  const [edit, setEdit] = useState<EditState>({ kind: "none" });

  const refresh = async () => {
    const [a, m] = await Promise.all([listAnnouncements(), listMaintenanceWindows()]);
    setAnns(a);
    setMnts(m);
    setLoading(false);
  };
  useEffect(() => { void refresh(); }, []);

  const toggleAnn = async (a: Announcement) => { await updateAnnouncement(a.id, { active: !a.active }); void refresh(); };
  const toggleMnt = async (m: MaintenanceWindow) => { await updateMaintenance(m.id, { active: !m.active }); void refresh(); };
  const closeEdit = () => setEdit({ kind: "none" });
  const saved = () => { setEdit({ kind: "none" }); void refresh(); };

  const liveBanner = anns.find((a) => a.active);
  const liveMnt = mnts.find((m) => m.active);

  const stop = (e: React.MouseEvent) => e.stopPropagation();

  const annCols: Column<Announcement>[] = [
    { key: "title", header: "Bannière", render: (a) => <TwoLine primary={a.title_fr} secondary={a.title_en} /> },
    { key: "kind", header: "Type", hideBelow: 760, render: (a) => <Pill tone={KIND_META[a.kind].tone}>{KIND_META[a.kind].label}</Pill> },
    { key: "state", header: "État", render: (a) => (a.active ? <Pill tone="strong">En ligne</Pill> : <Pill>Hors ligne</Pill>) },
    { key: "date", header: "Créée le", align: "right", sort: (a) => a.created_at, hideBelow: 900, render: (a) => <span style={{ color: C.t2, whiteSpace: "nowrap" }}>{fmt(a.created_at)}</span> },
    { key: "act", header: "", align: "right", render: (a) => <span onClick={stop}><Button size="sm" variant="ghost" onClick={() => toggleAnn(a)}>{a.active ? "Retirer" : "Mettre en ligne"}</Button></span> },
  ];

  const mntCols: Column<MaintenanceWindow>[] = [
    { key: "title", header: "Maintenance", render: (m) => <TwoLine primary={m.title_fr} secondary={m.title_en} /> },
    { key: "when", header: "Période", hideBelow: 760, render: (m) => <span style={{ color: C.t2 }}>{m.starts_at ? fmt(m.starts_at) : "Immédiate"}{m.ends_at ? ` → ${fmt(m.ends_at)}` : ""}</span> },
    { key: "state", header: "État", render: (m) => (m.active ? <Pill tone="warn" dot>Active</Pill> : <Pill>Inactive</Pill>) },
    { key: "act", header: "", align: "right", render: (m) => <span onClick={stop}><Button size="sm" variant="ghost" onClick={() => toggleMnt(m)}>{m.active ? "Désactiver" : "Activer"}</Button></span> },
  ];

  return (
    <div>
      <KeyValues items={[
        ["Bannière en ligne", liveBanner
          ? <span style={{ display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>{liveBanner.title_fr}<Pill tone={KIND_META[liveBanner.kind].tone}>{KIND_META[liveBanner.kind].label}</Pill></span>
          : <span style={{ color: C.t3 }}>{loading ? "…" : "Aucune"}</span>],
        ["Maintenance", liveMnt
          ? <span style={{ display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}><Pill tone="warn" dot>Active</Pill>{liveMnt.title_fr}{liveMnt.ends_at && <span style={{ color: C.t3 }}>jusqu'au {fmt(liveMnt.ends_at)}</span>}</span>
          : <span style={{ color: C.t3 }}>{loading ? "…" : "Aucune, l'app est ouverte"}</span>],
      ]} />

      <Tabs style={{ marginTop: 28 }} value={tab} onChange={setTab} items={[
        { id: "banner", label: "Bannières", count: anns.length },
        { id: "maintenance", label: "Maintenance", count: mnts.length, tone: liveMnt ? "warn" : undefined },
      ]} />

      <Toolbar right={
        <Button size="sm" variant="primary" icon={<Plus style={{ width: 14, height: 14 }} />} onClick={() => setEdit({ kind: tab === "banner" ? "ann" : "mnt" })}>
          {tab === "banner" ? "Nouvelle bannière" : "Planifier une maintenance"}
        </Button>
      }>
        <span style={{ fontSize: 12.5, color: C.t3 }}>
          {tab === "banner" ? "Message affiché en haut de l'app et du site." : "Écran qui bloque les pages clients pendant une intervention."}
        </span>
      </Toolbar>

      {tab === "banner" ? (
        <DataTable
          rows={anns}
          columns={annCols}
          rowKey={(a) => a.id}
          onRowClick={(a) => setEdit({ kind: "ann", item: a })}
          initialSort={{ key: "date", dir: "desc" }}
          empty={<EmptyState icon={Megaphone} title={loading ? "Chargement…" : "Aucune bannière"} text={loading ? undefined : "Créez une bannière pour prévenir les clients d'un changement ou d'un incident."} />}
          mobile={(a) => (
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ flex: 1, minWidth: 0 }}><TwoLine primary={a.title_fr} secondary={fmt(a.created_at)} /></div>
              {a.active ? <Pill tone="strong">En ligne</Pill> : <Pill>Hors ligne</Pill>}
            </div>
          )}
        />
      ) : (
        <DataTable
          rows={mnts}
          columns={mntCols}
          rowKey={(m) => m.id}
          onRowClick={(m) => setEdit({ kind: "mnt", item: m })}
          empty={<EmptyState icon={Wrench} title={loading ? "Chargement…" : "Aucune maintenance"} text={loading ? undefined : "Planifiez une maintenance pour fermer l'app aux clients pendant une intervention."} />}
          mobile={(m) => (
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ flex: 1, minWidth: 0 }}><TwoLine primary={m.title_fr} secondary={m.starts_at ? fmt(m.starts_at) : "Immédiate"} /></div>
              {m.active ? <Pill tone="warn">Active</Pill> : <Pill>Inactive</Pill>}
            </div>
          )}
        />
      )}

      {edit.kind === "ann" && <AnnouncementEditor initial={edit.item} onClose={closeEdit} onSaved={saved} />}
      {edit.kind === "mnt" && <MaintenanceEditor initial={edit.item} onClose={closeEdit} onSaved={saved} />}
    </div>
  );
};

export default AnnouncementsPanel;
