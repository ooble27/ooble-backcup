import { useEffect, useMemo, useState } from "react";
import { ArrowLeftRight, BadgeCheck, Calculator, Check, ChevronRight, Headphones, Megaphone, ScanFace, ShieldCheck, UserPlus, Users } from "lucide-react";
import { TeamHero } from "./heroes";
import { fetchCached, peek, put } from "@/lib/adminCache";
import { fetchTeam, setMemberRoles, removeMember, addMemberByEmail, type LiveTeamMember } from "@/lib/adminTeam";
import { ROLES, TAB_LABEL, roleLabel, tabsFor, type Role } from "@/lib/roles";
import { C, FONT } from "./adminTheme";
import { Button, Field, Notice, SidePanel, TextInput } from "./ui";
import { Avatar, DataTable, EmptyState, Toolbar, TwoLine, type Column } from "./layout";

/**
 * Équipe : qui fait quoi. Chaque membre peut cumuler plusieurs rôles (ex. Marketing + Support) ;
 * en cochant, on voit tout de suite les pages auxquelles la personne aura accès.
 */

const validEmail = (v: string) => /^\S+@\S+\.\S+$/.test(v);
const ICON: Record<Role, typeof Users> = {
  admin: BadgeCheck, operator: ArrowLeftRight, compliance: ShieldCheck, accounting: Calculator, kyc_reviewer: ScanFace, support: Headphones, marketing: Megaphone,
};
const rolesText = (roles: Role[]) => roles.map(roleLabel).join(" · ");

const CSS = `
.tm-role { all: unset; box-sizing: border-box; width: 100%; display: flex; align-items: flex-start; gap: 14px; padding: 14px 4px; cursor: pointer; font-family: ${FONT}; transition: transform .3s cubic-bezier(.22,1,.36,1); }
@media (any-hover: hover) { .tm-role:hover { transform: translateX(4px); } }
.tm-role:focus-visible { outline: 2px solid var(--a-accent); outline-offset: 2px; border-radius: 10px; }
.tm-ic { width: 34px; height: 34px; border-radius: 99px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; transition: background .2s, color .2s; }
.tm-box { width: 20px; height: 20px; border-radius: 6px; flex-shrink: 0; margin-top: 7px; display: flex; align-items: center; justify-content: center; box-sizing: border-box; transition: background .15s, box-shadow .15s; }
.tm-f { all: unset; cursor: pointer; font-family: ${FONT}; font-size: 14px; color: var(--a-t3); padding: 4px 0; transition: color .15s; white-space: nowrap; }
.tm-f:hover, .tm-f[aria-pressed="true"] { color: var(--a-t1); }
.tm-f[aria-pressed="true"] { font-weight: 500; }
.tm-f span { background-image: linear-gradient(currentColor, currentColor); background-repeat: no-repeat; background-position: 0 100%; background-size: 0 1.5px; padding-bottom: 3px; transition: background-size .35s cubic-bezier(.22,1,.36,1); }
.tm-f[aria-pressed="true"] span, .tm-f:hover span { background-size: 100% 1.5px; }
.tm-f:focus-visible { outline: 2px solid var(--a-accent); outline-offset: 3px; border-radius: 4px; }
`;

/** Choix des rôles : on coche un ou plusieurs postes ; chacun dit ce que fait la personne. */
function RolePicker({ value, onChange }: { value: Role[]; onChange: (r: Role[]) => void }) {
  const admin = value.includes("admin");
  const toggle = (r: Role) => onChange(value.includes(r) ? value.filter((x) => x !== r) : [...value, r]);
  const pages = [...tabsFor(value)];
  return (
    <div>
      <div role="group" aria-label="Rôles">
        {ROLES.map((r) => {
          const Icon = ICON[r.id];
          const on = value.includes(r.id);
          const implied = admin && r.id !== "admin";
          return (
            <button key={r.id} type="button" role="checkbox" aria-checked={on} className="tm-role" onClick={() => toggle(r.id)} style={{ opacity: implied && !on ? 0.45 : 1 }}>
              <span className="tm-ic" style={{ background: on ? C.t1 : C.hover2, color: on ? C.bg : C.t2 }}>
                <Icon style={{ width: 16, height: 16 }} strokeWidth={1.8} />
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 14, color: C.t1, fontWeight: on ? 500 : 400 }}>{r.label}</span>
                <span style={{ display: "block", marginTop: 2, fontSize: 12.5, lineHeight: 1.5, color: C.t3 }}>{r.mission}</span>
              </span>
              <span className="tm-box" aria-hidden style={{ background: on ? C.t1 : "transparent", boxShadow: on ? "none" : `inset 0 0 0 1.5px ${C.bd}` }}>
                {on && <Check style={{ width: 13, height: 13, color: C.bg }} strokeWidth={3} />}
              </span>
            </button>
          );
        })}
      </div>
      {/* Ce que la personne verra, mis à jour à chaque case cochée. */}
      <div style={{ marginTop: 18, padding: "14px 16px", borderRadius: 14, background: C.hover2 }}>
        <p style={{ margin: 0, fontSize: 12.5, color: C.t3 }}>{admin ? "Accès complet, y compris l'équipe et la plateforme." : value.length ? "Pages auxquelles la personne aura accès" : "Cochez au moins un rôle."}</p>
        {!admin && pages.length > 0 && (
          <p style={{ margin: "6px 0 0", fontSize: 13.5, lineHeight: 1.6, color: C.t1 }}>{pages.map((t) => TAB_LABEL[t]).join(", ")}.</p>
        )}
      </div>
    </div>
  );
}

const TeamPanel = () => {
  const [members, setMembers] = useState<LiveTeamMember[]>(() => peek<LiveTeamMember[]>("team")?.value?.filter((m) => Array.isArray(m.roles)) ?? []);
  const [loading, setLoading] = useState(() => !peek("team"));
  const [filter, setFilter] = useState<"all" | Role>("all");

  const [adding, setAdding] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRoles, setInviteRoles] = useState<Role[]>(["operator"]);
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteMsg, setInviteMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const [editing, setEditing] = useState<LiveTeamMember | null>(null);
  const [editRoles, setEditRoles] = useState<Role[]>([]);
  const [editMsg, setEditMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const reload = () => fetchTeam().then((m) => { setMembers(m); put("team", m); });
  useEffect(() => {
    fetchCached("team", fetchTeam).then((m) => { setMembers(m); setLoading(false); });
  }, []);

  const openEdit = (m: LiveTeamMember) => { setEditing(m); setEditRoles(m.roles); setEditMsg(null); setConfirmRemove(false); };
  const same = (a: Role[], b: Role[]) => a.length === b.length && a.every((r) => b.includes(r));

  const saveRoles = async () => {
    if (!editing) return;
    setSaving(true); setEditMsg(null);
    const res = await setMemberRoles(editing.userId, editRoles);
    setSaving(false);
    if (res.error) { setEditMsg(res.error); return; }
    setMembers((prev) => prev.map((m) => (m.userId === editing.userId ? { ...m, roles: ROLES.map((r) => r.id).filter((id) => editRoles.includes(id)) } : m)));
    setEditing(null);
    void reload();
  };

  const handleRemove = async () => {
    if (!editing) return;
    const res = await removeMember(editing.userId);
    if (res.error) { setEditMsg(res.error); setConfirmRemove(false); return; }
    setMembers((prev) => prev.filter((m) => m.userId !== editing.userId));
    setEditing(null);
    void reload();
  };

  const invite = async () => {
    if (inviteBusy || !validEmail(inviteEmail) || !inviteRoles.length) return;
    setInviteBusy(true); setInviteMsg(null);
    const res = await addMemberByEmail(inviteEmail, inviteRoles);
    setInviteBusy(false);
    if (res.error) { setInviteMsg({ ok: false, text: res.error }); return; }
    setInviteMsg({ ok: true, text: `${inviteEmail} fait maintenant partie de l'équipe : ${rolesText(inviteRoles)}.` });
    setInviteEmail("");
    void reload();
  };

  const counts = useMemo(() => {
    const c: Partial<Record<Role, number>> = {};
    for (const m of members) for (const r of m.roles) c[r] = (c[r] ?? 0) + 1;
    return c;
  }, [members]);
  const rows = filter === "all" ? members : members.filter((m) => m.roles.includes(filter));

  const columns: Column<LiveTeamMember>[] = [
    { key: "who", header: "Membre", sort: (m) => m.name, render: (m) => <TwoLine lead={<Avatar name={m.name} />} primary={m.name} secondary={m.email} /> },
    { key: "role", header: "Rôles", sort: (m) => m.roles.join(), render: (m) => (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
        <span style={{ display: "inline-flex" }}>
          {m.roles.slice(0, 4).map((r, i) => { const Icon = ICON[r]; return (
            <span key={r} title={roleLabel(r)} style={{ width: 26, height: 26, borderRadius: 99, marginLeft: i ? -6 : 0, background: C.bg, boxShadow: `0 0 0 2px ${C.bg}, inset 0 0 0 1px ${C.bds}`, color: C.t2, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
              <Icon style={{ width: 13, height: 13 }} strokeWidth={1.8} />
            </span>
          ); })}
        </span>
        <span style={{ color: C.t1 }}>{rolesText(m.roles)}</span>
      </span>
    ) },
    { key: "go", header: "", align: "right", width: 40, render: () => <ChevronRight style={{ width: 16, height: 16, color: C.t3 }} /> },
  ];

  return (
    <div>
      <style>{CSS}</style>
      <TeamHero loading={loading} members={members.flatMap((m) => m.roles.map((r) => ({ name: m.name, role: roleLabel(r) })))} people={members.length} />
      <Toolbar style={{ marginTop: 0 }} right={
        <Button variant="primary" size="sm" icon={<UserPlus style={{ width: 14, height: 14 }} />} onClick={() => { setAdding(true); setInviteMsg(null); }}>
          Ajouter un membre
        </Button>
      }>
        <nav aria-label="Filtrer par rôle" style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "center" }}>
          <button type="button" className="tm-f" aria-pressed={filter === "all"} onClick={() => setFilter("all")}><span>Tous</span> <small style={{ color: C.t3 }}>{members.length}</small></button>
          {ROLES.filter((r) => counts[r.id]).map((r) => (
            <button key={r.id} type="button" className="tm-f" aria-pressed={filter === r.id} onClick={() => setFilter(r.id)}><span>{r.label}</span> <small style={{ color: C.t3 }}>{counts[r.id]}</small></button>
          ))}
        </nav>
      </Toolbar>

      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(m) => m.userId}
        onRowClick={openEdit}
        selectedKey={editing?.userId}
        initialSort={{ key: "who", dir: "asc" }}
        empty={<EmptyState icon={Users} title={loading ? "Chargement…" : "Aucun membre"} text={loading ? undefined : "Ajoutez un premier membre à l'équipe."} />}
        mobile={(m) => <TwoLine lead={<Avatar name={m.name} size={34} />} primary={m.name} secondary={rolesText(m.roles)} />}
      />

      {adding && (
        <SidePanel title="Ajouter un membre" subtitle="Donner un ou plusieurs rôles à un compte Ooble existant" onClose={() => setAdding(false)}
          footer={<>
            <Button variant="ghost" onClick={() => setAdding(false)}>Fermer</Button>
            <Button variant="primary" disabled={inviteBusy || !validEmail(inviteEmail) || !inviteRoles.length} onClick={invite}>{inviteBusy ? "Ajout…" : "Ajouter à l'équipe"}</Button>
          </>}>
          <p style={{ margin: "0 0 20px", fontSize: 13, lineHeight: 1.6, color: C.t2 }}>
            La personne crée d'abord son compte Ooble normalement, puis vous lui donnez ses rôles ici avec son courriel.
          </p>
          <Field label="Courriel du compte">
            <TextInput type="email" spellCheck={false} autoCapitalize="none" autoFocus placeholder="prenom@exemple.ca"
              value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void invite(); }} />
          </Field>
          <p style={{ margin: "24px 0 4px", fontSize: 12.5, color: C.t2 }}>Rôles</p>
          <RolePicker value={inviteRoles} onChange={setInviteRoles} />
          {inviteMsg && <div style={{ marginTop: 16 }}><Notice tone={inviteMsg.ok ? "ok" : "err"}>{inviteMsg.text}</Notice></div>}
        </SidePanel>
      )}

      {editing && (
        <SidePanel title={editing.name} subtitle={editing.email} onClose={() => setEditing(null)}
          footer={<>
            <Button variant="ghost" onClick={() => setEditing(null)}>Annuler</Button>
            <Button variant="primary" disabled={saving || !editRoles.length || same(editRoles, editing.roles)} onClick={saveRoles}>{saving ? "Enregistrement…" : "Enregistrer"}</Button>
          </>}>
          <p style={{ margin: "0 0 4px", fontSize: 12.5, color: C.t2 }}>Rôles</p>
          <RolePicker value={editRoles} onChange={setEditRoles} />
          {editMsg && <div style={{ marginTop: 16 }}><Notice tone="err">{editMsg}</Notice></div>}

          <div style={{ marginTop: 32 }}>
            <p style={{ margin: 0, fontSize: 13.5, color: C.t1 }}>Retirer de l'équipe</p>
            <p style={{ margin: "4px 0 12px", fontSize: 12.5, lineHeight: 1.55, color: C.t3 }}>
              La personne perd l'accès au back-office. Son compte client reste intact.
            </p>
            {confirmRemove ? (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <Button variant="danger" size="sm" onClick={handleRemove}>Confirmer le retrait</Button>
                <Button variant="ghost" size="sm" onClick={() => setConfirmRemove(false)}>Annuler</Button>
              </div>
            ) : (
              <Button variant="danger" size="sm" onClick={() => setConfirmRemove(true)}>Retirer</Button>
            )}
          </div>
        </SidePanel>
      )}
    </div>
  );
};

export default TeamPanel;
