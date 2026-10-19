import { supabase } from "@/integrations/supabase/client";
import { fetchCached, peek } from "@/lib/adminCache";
import type { LiveTeamMember } from "@/lib/adminTeam";
import { sendCustomEmail } from "@/lib/email";
import { orderRef } from "@/lib/orders";
import { roleLabel, sortRoles, type Role } from "@/lib/roles";

/**
 * Espace de l'équipe : profils (avatar, couleur, statut), notes à l'équipe (canaux par poste,
 * pages de 50 messages, mentions), tâches et bloc-notes privé. Les écritures passent par des
 * fonctions de la base (team_*) qui vérifient les droits ; « retirer » masque partout sans effacer.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rpc = (fn: string, args: Record<string, unknown> = {}) => (supabase.rpc as any)(fn, args) as Promise<{ data: unknown; error: { message: string } | null }>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const table = (name: string) => (supabase.from as any)(name);
const done = ({ error }: { error: { message: string } | null }) => (error ? { error: error.message } : {});

export type Audience = "all" | Role;
export const audienceLabel = (a: string) => (a === "all" ? "Toute l'équipe" : roleLabel(a));

/* ─── Profils et annuaire ─── */
export type TeamColor = "coral" | "orange" | "sun" | "sage" | "teal" | "indigo" | "blue" | "pink";
/** Couleur du nom : « white » est la couleur du texte d'origine (blanc en sombre, noir en clair). */
export type NameColor = "white" | TeamColor;
export type AvatarBg = "light" | TeamColor;
export type Presence = "available" | "busy" | "away";
export const TEAM_COLORS: { v: TeamColor; label: string }[] = [
  { v: "coral", label: "Corail" }, { v: "orange", label: "Orange" }, { v: "sun", label: "Soleil" }, { v: "sage", label: "Sauge" },
  { v: "teal", label: "Lagon" }, { v: "indigo", label: "Indigo" }, { v: "blue", label: "Bleu" }, { v: "pink", label: "Rose" },
];
export const NAME_COLORS: { v: NameColor; label: string }[] = [{ v: "white", label: "Blanc (d'origine)" }, ...TEAM_COLORS];
export const PRESENCE_LABEL: Record<Presence, string> = { available: "Disponible", busy: "Occupé", away: "Absent" };
export interface TeamMember extends LiveTeamMember {
  seed: string | null; photo: string | null; bg: AvatarBg; color: NameColor; status: Presence; statusUntil: string | null; statusNote: string | null;
}

/** Annuaire de l'équipe, lisible par tout membre (team_directory), avec le profil de chacun. */
const DIR_EVENT = "ooble:team-dir";
const toMember = (m: Record<string, unknown>): TeamMember => ({
  userId: String(m.id), name: String(m.name ?? "Membre"), email: String(m.email ?? ""), roles: sortRoles((m.roles as string[]) ?? []) as Role[],
  seed: (m.seed as string) ?? null, photo: (m.photo as string) ?? null, bg: ((m.bg as AvatarBg) ?? "light"), color: ((m.color as NameColor) ?? "coral"),
  status: ((m.status as Presence) ?? "available"), statusUntil: (m.status_until as string) ?? null, statusNote: (m.status_note as string) ?? null,
});
export const peekMembers = () => (peek<TeamMember[]>("team.dir")?.value ?? []).filter((m) => typeof m.color === "string");
export const loadMembers = () => fetchCached("team.dir", async (): Promise<TeamMember[]> => {
  const { data, error } = await rpc("team_directory");
  if (error) throw new Error(error.message);
  const list = ((data as Record<string, unknown>[]) ?? []).map(toMember);
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(DIR_EVENT));
  return list;
});
/** Prévient chaque page quand l'annuaire change (profil modifié par soi ou par un autre). */
export function onMembersChange(fn: () => void) {
  window.addEventListener(DIR_EVENT, fn);
  return () => window.removeEventListener(DIR_EVENT, fn);
}
export const memberById = (id: string | null | undefined) => (id ? peekMembers().find((m) => m.userId === id) : undefined);
/** Prénom d'un membre : c'est ainsi que l'équipe se nomme partout dans le back-office. */
export const firstName = (n: string) => n.trim().split(/\s+/)[0] || n;

export interface ProfileInput { seed: string | null; photo: string | null; bg: AvatarBg; color: NameColor; status: Presence; statusUntil: string | null; statusNote: string }
export async function saveProfile(p: ProfileInput) {
  const { error } = await rpc("team_profile_save", { _seed: p.seed, _photo: p.photo, _bg: p.bg, _color: p.color, _status: p.status, _until: p.statusUntil, _note: p.statusNote });
  if (error) return { error: error.message };
  await loadMembers().catch(() => undefined);
  return {};
}

/** Photo de profil : recadrée au carré, réduite à 192 px, en JPEG (quelques dizaines de Ko). */
export async function resizePhoto(file: File): Promise<string> {
  if (!/^image\//.test(file.type)) throw new Error("Choisissez une image (JPEG, PNG ou WebP).");
  if (file.size > 10 * 1024 * 1024) throw new Error("Image trop lourde (10 Mo au plus).");
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ko(new Error("Image illisible.")); i.src = url; });
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const canvas = Object.assign(document.createElement("canvas"), { width: 192, height: 192 });
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Image illisible.");
    ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, 192, 192);
    let q = 0.86, out = canvas.toDataURL("image/jpeg", q);
    while (out.length > 140_000 && q > 0.4) { q -= 0.12; out = canvas.toDataURL("image/jpeg", q); }
    return out;
  } finally { URL.revokeObjectURL(url); }
}

/* ─── Compteurs ─── */
export interface TeamCounts { unreadNotes: number; mentions: number; myTasks: number; myOverdue: number }
export async function loadCounts(): Promise<TeamCounts> {
  const { data, error } = await rpc("team_counts");
  if (error) throw new Error(error.message);
  const d = (data ?? {}) as Record<string, unknown>;
  return { unreadNotes: Number(d.unread_notes ?? 0), mentions: Number(d.mentions ?? 0), myTasks: Number(d.my_tasks ?? 0), myOverdue: Number(d.my_overdue ?? 0) };
}

/* ─── Notes ─── */
export interface NoteReply { id: string; body: string; authorId: string; authorName: string; at: string; editedAt: string | null }
export interface TeamNote {
  id: string; body: string; audience: Audience; pinned: boolean; archived: boolean; authorId: string; authorName: string; at: string; editedAt: string | null;
  mentions: string[]; readBy: { userId: string; at: string }[]; replies: NoteReply[];
}
export const NOTE_PAGE = 50;
const NOTE_FIELDS = "id, body, audience, pinned, archived, author_id, author_name, created_at, edited_at, mentions, team_note_reads(user_id, read_at), team_note_replies(id, body, author_id, author_name, created_at, edited_at)";
const toNote = (r: Record<string, unknown>): TeamNote => ({
  id: String(r.id), body: String(r.body), audience: r.audience as Audience, pinned: !!r.pinned, archived: !!r.archived,
  authorId: String(r.author_id), authorName: String(r.author_name ?? "Membre"), at: String(r.created_at), editedAt: (r.edited_at as string) ?? null,
  mentions: ((r.mentions as string[]) ?? []).map(String),
  readBy: ((r.team_note_reads as Record<string, unknown>[]) ?? []).map((x) => ({ userId: String(x.user_id), at: String(x.read_at) })),
  replies: ((r.team_note_replies as Record<string, unknown>[]) ?? [])
    .map((x) => ({ id: String(x.id), body: String(x.body), authorId: String(x.author_id), authorName: String(x.author_name ?? "Membre"), at: String(x.created_at), editedAt: (x.edited_at as string) ?? null }))
    .sort((a, b) => a.at.localeCompare(b.at)),
});

/** Une page de messages d'un canal (ou des archives), du plus récent au plus ancien. */
export async function loadChannel(audience: Audience | null, opts: { before?: string; archived?: boolean; limit?: number } = {}): Promise<TeamNote[]> {
  let q = table("team_notes").select(NOTE_FIELDS).eq("archived", !!opts.archived);
  if (audience) q = q.eq("audience", audience);
  if (opts.before) q = q.lt("created_at", opts.before);
  const { data, error } = await q.order("created_at", { ascending: false }).limit(opts.limit ?? NOTE_PAGE);
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map(toNote);
}
/** Recherche dans la messagerie : messages et réponses de tous les canaux que je peux lire (archives comprises). */
export async function searchNotes(query: string): Promise<TeamNote[]> {
  const q = query.trim().replace(/[%_\\]/g, (c) => `\\${c}`);
  if (q.length < 2) return [];
  const [{ data: a, error: e1 }, { data: r }] = await Promise.all([
    table("team_notes").select(NOTE_FIELDS).ilike("body", `%${q}%`).order("created_at", { ascending: false }).limit(30),
    table("team_note_replies").select("note_id").ilike("body", `%${q}%`).order("created_at", { ascending: false }).limit(30),
  ]);
  if (e1) throw new Error(e1.message);
  const found = ((a ?? []) as Record<string, unknown>[]).map(toNote);
  const more = [...new Set(((r ?? []) as { note_id: string }[]).map((x) => String(x.note_id)))].filter((id) => !found.some((n) => n.id === id));
  if (more.length) {
    const { data: b } = await table("team_notes").select(NOTE_FIELDS).in("id", more);
    found.push(...((b ?? []) as Record<string, unknown>[]).map(toNote));
  }
  return found.sort((x, y) => y.at.localeCompare(x.at)).slice(0, 40);
}
/** Notes épinglées d'un canal (toujours en haut, même si elles sont anciennes). */
export async function loadPinned(audience: Audience): Promise<TeamNote[]> {
  const { data, error } = await table("team_notes").select(NOTE_FIELDS).eq("archived", false).eq("pinned", true).eq("audience", audience).order("created_at", { ascending: false }).limit(10);
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map(toNote);
}
/** Les dernières notes, tous canaux confondus (Mon espace). */
export const loadRecentNotes = (limit = 5) => loadChannel(null, { limit });

export interface Unread { channels: Partial<Record<Audience, number>>; mentions: number; mentionChannels: Partial<Record<Audience, number>> }
export async function loadUnread(): Promise<Unread> {
  const { data, error } = await rpc("team_note_unread");
  if (error) throw new Error(error.message);
  const d = (data ?? {}) as { channels?: Record<string, number>; mentions?: number; mention_channels?: Record<string, number> };
  return { channels: (d.channels ?? {}) as Unread["channels"], mentions: Number(d.mentions ?? 0), mentionChannels: (d.mention_channels ?? {}) as Unread["channels"] };
}
/** Pour chaque membre, ses notes non lues dans ce canal. */
export async function loadChannelReaders(audience: Audience): Promise<Record<string, number>> {
  const { data, error } = await rpc("team_channel_readers", { _audience: audience });
  if (error) throw new Error(error.message);
  return Object.fromEntries(Object.entries((data ?? {}) as Record<string, unknown>).map(([k, v]) => [k, Number(v)]));
}

export const postNote = (body: string, audience: Audience, pinned: boolean, mentions: string[] = []) =>
  rpc("team_note_send", { _body: body, _audience: audience, _pinned: pinned, _mentions: mentions }).then(done);
export const editNote = (id: string, body: string) => rpc("team_note_edit", { _id: id, _body: body }).then(done);
export const removeNote = (id: string) => rpc("team_note_remove", { _id: id }).then(done);
export const editReply = (id: string, body: string) => rpc("team_reply_edit", { _id: id, _body: body }).then(done);
export const removeReply = (id: string) => rpc("team_reply_remove", { _id: id }).then(done);
export const setNote = (id: string, patch: { pinned?: boolean; archived?: boolean }) =>
  rpc("team_note_set", { _id: id, _pinned: patch.pinned ?? null, _archived: patch.archived ?? null }).then(done);
export const markNotesRead = (ids: string[]) => (ids.length ? rpc("team_note_mark_read", { _ids: ids }).then(done) : Promise.resolve({}));
export const replyNote = (id: string, body: string) => rpc("team_note_reply", { _note: id, _body: body }).then(done);

/** Membres qui doivent voir une note : tous, ou ceux du poste visé (et les administrateurs). */
export function audienceMembers<T extends LiveTeamMember>(members: T[], audience: string): T[] {
  return members.filter((m) => audience === "all" || m.roles.includes(audience as Role) || m.roles.includes("admin"));
}

/* ─── Tâches ─── */
export type TaskStatus = "todo" | "doing" | "done";
export const STATUS_LABEL: Record<TaskStatus, string> = { todo: "À faire", doing: "En cours", done: "Fait" };
export interface TaskComment { id: string; body: string; authorId: string | null; authorName: string; at: string }
/** Une étape de la liste de contrôle d'une tâche. */
export interface TaskStep { text: string; done: boolean; by: string | null; at: string | null }
export interface TeamTask {
  steps: TaskStep[];
  /** Remise à l'équipe par une passation (à reprendre). */
  handedOffBy: string | null;
  id: string; title: string; details: string | null; assigneeId: string | null; assigneeRole: Role | null; dueOn: string | null; status: TaskStatus;
  clientId: string | null; clientName: string | null; orderId: string | null; orderRef: string | null; archived: boolean;
  createdBy: string; createdByName: string; at: string; updatedAt: string; doneAt: string | null; doneByName: string | null; comments: TaskComment[];
}
/** Tâches non archivées (ou archivées), ou seulement celles d'un client ou d'une commande. */
export async function loadTasks(archived = false, link?: { clientId?: string; orderId?: string }): Promise<TeamTask[]> {
  let q = table("team_tasks")
    .select("*, client:profiles!team_tasks_client_id_fkey(full_name, email), team_task_comments(id, body, author_id, author_name, created_at)")
    .eq("archived", archived);
  if (link?.clientId) q = q.eq("client_id", link.clientId);
  if (link?.orderId) q = q.eq("order_id", link.orderId);
  const { data, error } = await q.order("created_at", { ascending: false }).limit(500);
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map((r) => {
    const c = r.client as { full_name?: string; email?: string } | null;
    return {
      id: String(r.id), title: String(r.title), details: (r.details as string) ?? null, assigneeId: (r.assignee_id as string) ?? null,
      assigneeRole: (r.assignee_role as Role) ?? null, dueOn: (r.due_on as string) ?? null, status: r.status as TaskStatus,
      clientId: (r.client_id as string) ?? null, clientName: c ? (c.full_name?.trim() || c.email || "Client") : null,
      orderId: (r.order_id as string) ?? null, orderRef: r.order_id ? orderRef(String(r.order_id)) : null, archived: !!r.archived,
      createdBy: String(r.created_by), createdByName: String(r.created_by_name ?? "Membre"), at: String(r.created_at), updatedAt: String(r.updated_at),
      doneAt: (r.done_at as string) ?? null, doneByName: (r.done_by_name as string) ?? null,
      handedOffBy: (r.handed_off_by_name as string) ?? null,
      steps: (Array.isArray(r.steps) ? (r.steps as Record<string, unknown>[]) : []).map((x) => ({ text: String(x.text ?? ""), done: !!x.done, by: (x.by as string) ?? null, at: (x.at as string) ?? null })),
      comments: ((r.team_task_comments as Record<string, unknown>[]) ?? [])
        .map((x) => ({ id: String(x.id), body: String(x.body), authorId: (x.author_id as string) ?? null, authorName: String(x.author_name ?? "Membre"), at: String(x.created_at) }))
        .sort((a, b) => a.at.localeCompare(b.at)),
    };
  });
}
export interface TaskInput { title: string; details: string; assigneeId: string | null; assigneeRole: Role | null; dueOn: string | null; clientId: string | null; orderId: string | null }
export async function saveTask(id: string | null, t: TaskInput): Promise<{ id?: string; error?: string }> {
  const { data, error } = await rpc("team_task_save", {
    _id: id, _title: t.title, _details: t.details, _assignee: t.assigneeId, _role: t.assigneeRole, _due: t.dueOn, _client: t.clientId, _order: t.orderId,
  });
  return error ? { error: error.message } : { id: String(data) };
}
export const setTaskStatus = (id: string, status: TaskStatus) => rpc("team_task_status", { _id: id, _status: status }).then(done);
export const archiveTask = (id: string) => rpc("team_task_archive", { _id: id }).then(done);
export const removeTask = (id: string) => rpc("team_task_remove", { _id: id }).then(done);
export async function tidyDoneTasks(): Promise<{ count?: number; error?: string }> {
  const { data, error } = await rpc("team_tasks_tidy_mine");
  return error ? { error: error.message } : { count: Number(data ?? 0) };
}
/** Prendre une tâche d'un poste, de toute l'équipe ou reprise d'une passation : elle devient la mienne. */
export const takeTask = (id: string) => rpc("team_task_take", { _id: id }).then(done);
export const commentTask = (id: string, body: string) => rpc("team_task_comment", { _task: id, _body: body }).then(done);

/* ─── Listes de contrôle ─── */
export const setTaskSteps = (id: string, steps: string[]) => rpc("team_task_set_steps", { _id: id, _steps: steps }).then(done);
export const checkTaskStep = (id: string, index: number, isDone: boolean) => rpc("team_task_check", { _id: id, _index: index, _done: isDone }).then(done);
export interface ChecklistTemplate { id: string; name: string; steps: string[]; mine?: boolean; builtIn?: boolean }
/** Modèles fournis : les vérifications qui reviennent chez Ooble. */
export const BUILTIN_CHECKLISTS: ChecklistTemplate[] = [
  { id: "b-entreprise", builtIn: true, name: "Vérifier un dossier entreprise", steps: [
    "Vérifier le numéro d'entreprise au registre", "Vérifier l'identité du représentant", "Vérifier les bénéficiaires effectifs (25 % et plus)",
    "Vérifier l'adresse de l'entreprise", "Consigner la décision dans la fiche du client"] },
  { id: "b-desjardins", builtIn: true, name: "Rapprochement bancaire Desjardins", steps: [
    "Importer le relevé Desjardins", "Rapprocher les dépôts Interac avec les commandes", "Rapprocher les virements envoyés",
    "Expliquer les lignes restantes", "Clôturer la période"] },
  { id: "b-stock", builtIn: true, name: "Vérifier le stock USDT", steps: [
    "Vérifier les soldes du portefeuille d'envoi par réseau", "Comparer avec la Trésorerie", "Prévoir une recharge si un réseau est bas"] },
];
export async function loadChecklistTemplates(me: string): Promise<ChecklistTemplate[]> {
  const { data, error } = await table("team_checklist_templates").select("id, name, steps, created_by").order("created_at", { ascending: false }).limit(100);
  if (error) return BUILTIN_CHECKLISTS;
  const saved = ((data ?? []) as Record<string, unknown>[]).map((r) => ({ id: String(r.id), name: String(r.name), steps: ((r.steps as string[]) ?? []).map(String), mine: r.created_by === me }));
  return [...BUILTIN_CHECKLISTS, ...saved];
}
export const saveChecklistTemplate = (name: string, steps: string[]) => rpc("team_checklist_template_save", { _name: name, _steps: steps }).then(done);
export const hideChecklistTemplate = (id: string) => rpc("team_checklist_template_hide", { _id: id }).then(done);


/** La tâche me concerne : confiée à moi, à un de mes postes, ou à toute l'équipe. */
export const isMine = (t: TeamTask, me: string, roles: readonly string[]) =>
  t.assigneeId === me || (!t.assigneeId && !t.assigneeRole) || (!!t.assigneeRole && roles.includes(t.assigneeRole));
export const todayToronto = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Toronto" });
export const isLate = (t: TeamTask) => t.status !== "done" && !!t.dueOn && t.dueOn < todayToronto();

/** Recherche d'un client à lier à une tâche (nom ou courriel). */
export async function searchClients(q: string): Promise<{ id: string; name: string; email: string }[]> {
  const s = q.trim().replace(/[%,()]/g, " ");
  if (s.length < 2) return [];
  const { data } = await supabase.from("profiles").select("id, full_name, email").or(`full_name.ilike.%${s}%,email.ilike.%${s}%`).limit(8);
  return (data ?? []).map((p) => ({ id: p.id, name: p.full_name?.trim() || p.email || "Client", email: p.email ?? "" }));
}

/** Commande par sa référence (OOB-XXXXXXXX) ou le début de son identifiant. */
export async function findOrder(ref: string): Promise<{ id: string; ref: string } | null> {
  const hex = ref.trim().replace(/^OOB-/i, "").toLowerCase();
  if (!/^[0-9a-f]{6,8}$/.test(hex)) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase.from as any)("orders").select("id").gte("id", `${hex.padEnd(8, "0")}-0000-0000-0000-000000000000`)
    .lte("id", `${hex.padEnd(8, "f")}-ffff-ffff-ffff-ffffffffffff`).limit(1);
  const id = (data as { id: string }[] | null)?.[0]?.id;
  return id ? { id, ref: orderRef(id) } : null;
}

/* ─── Courriel à qui reçoit une tâche ─── */
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const dueText = (d: string | null) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString("fr-CA", { weekday: "long", day: "numeric", month: "long" }) : null);

/** Prévient les personnes qui reçoivent la tâche (sauf soi-même). Sans effet si personne n'est visé. */
export async function notifyAssignees(t: TaskInput, byName: string, me: string): Promise<void> {
  if (!t.assigneeId && !t.assigneeRole) return;
  const members = await loadMembers().catch(() => peekMembers());
  const to = members.filter((m) => m.userId !== me && m.email && (m.userId === t.assigneeId || (!!t.assigneeRole && m.roles.includes(t.assigneeRole))));
  const due = dueText(t.dueOn);
  const site = typeof window !== "undefined" ? window.location.origin : "https://ooble.ca";
  await Promise.all(to.map((m) => sendCustomEmail({
    to: m.email,
    subject: `Nouvelle tâche : ${t.title}`,
    html: `<p style="margin:0 0 12px;font-size:15px;line-height:1.6;">Bonjour ${esc(m.name.split(" ")[0] || m.name)},</p>
<p style="margin:0 0 12px;font-size:15px;line-height:1.6;">${esc(byName)} vous a confié une tâche${t.assigneeRole ? ` (poste ${esc(roleLabel(t.assigneeRole))})` : ""} :</p>
<p style="margin:0 0 8px;font-size:18px;font-weight:600;line-height:1.4;">${esc(t.title)}</p>
${due ? `<p style="margin:0 0 8px;font-size:14px;color:#666;">À faire pour le ${esc(due)}</p>` : ""}
${t.details.trim() ? `<p style="margin:0 0 12px;font-size:14px;line-height:1.6;white-space:pre-line;">${esc(t.details.trim())}</p>` : ""}
<p style="margin:20px 0 0;"><a href="${site}/admin?tab=tasks" style="display:inline-block;padding:12px 20px;border-radius:10px;background:#14110f;color:#ffffff;font-weight:600;text-decoration:none;">Voir la tâche</a></p>`,
  })));
}

/* ─── Bloc-notes privé ─── */
export async function loadPrivateNote(): Promise<{ body: string; updatedAt: string | null }> {
  const { data, error } = await table("team_private_notes").select("body, updated_at").maybeSingle();
  if (error) throw new Error(error.message);
  const d = data as { body?: string; updated_at?: string } | null;
  return { body: d?.body ?? "", updatedAt: d?.updated_at ?? null };
}
export async function savePrivateNote(me: string, body: string) {
  const { error } = await table("team_private_notes").upsert({ user_id: me, body, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  return error ? { error: error.message } : {};
}

/* ─── Notifications sur le téléphone (choix de chacun) ─── */
export interface PushPrefs { mentions: boolean; tasks: boolean; orders: boolean }
export async function loadPushPrefs(): Promise<PushPrefs> {
  const { data, error } = await supabase.rpc("team_push_prefs_get" as never);
  if (error) throw new Error(error.message);
  const d = (data ?? {}) as Partial<PushPrefs>;
  return { mentions: d.mentions !== false, tasks: d.tasks !== false, orders: d.orders !== false };
}
export async function savePushPrefs(p: PushPrefs): Promise<{ error?: string }> {
  const { error } = await supabase.rpc("team_push_prefs_save" as never, { _mentions: p.mentions, _tasks: p.tasks, _orders: p.orders } as never);
  return error ? { error: error.message } : {};
}

/* ─── Passation de fin de journée ─── */
export interface Handoff {
  id: string; authorId: string; authorName: string; body: string; orderIds: string[]; taskIds: string[]; at: string;
  reads: { userId: string; name: string; at: string }[];
}
/** Les passations des deux derniers jours, la plus récente d'abord. */
export async function loadHandoffs(): Promise<Handoff[]> {
  const since = new Date(Date.now() - 48 * 3600_000).toISOString();
  const { data, error } = await table("team_handoffs")
    .select("id, author_id, author_name, body, order_ids, task_ids, created_at, team_handoff_reads(user_id, user_name, read_at)")
    .gte("created_at", since).order("created_at", { ascending: false }).limit(20);
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: String(r.id), authorId: String(r.author_id), authorName: String(r.author_name), body: String(r.body ?? ""),
    orderIds: ((r.order_ids as string[]) ?? []).map(String), taskIds: ((r.task_ids as string[]) ?? []).map(String), at: String(r.created_at),
    reads: ((r.team_handoff_reads as Record<string, unknown>[]) ?? []).map((x) => ({ userId: String(x.user_id), name: String(x.user_name), at: String(x.read_at) })),
  }));
}
export const postHandoff = (body: string, orderIds: string[], taskIds: string[]) =>
  rpc("team_handoff_post", { _body: body, _orders: orderIds, _tasks: taskIds }).then(done);
export const ackHandoff = (id: string) => rpc("team_handoff_ack", { _id: id }).then(done);
