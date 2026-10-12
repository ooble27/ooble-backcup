import { useEffect, useState } from "react";
import { TeamHero } from "./heroes";
import { fetchCached, peek, put } from "@/lib/adminCache";
import { BadgeCheck, ChevronRight, Headphones, Megaphone, ScanFace, ShieldCheck, UserPlus, UserRound, Users } from "lucide-react";
import { TEAM_ROLES, type TeamRole } from "@/lib/adminOrders";
import { fetchTeam, setMemberRole, removeMember, addRoleByEmail, type LiveTeamMember } from "@/lib/adminTeam";
import { C, FONT } from "./adminTheme";
import { Button, Field, Notice, SidePanel, TextInput } from "./ui";
import { Avatar, DataTable, EmptyState, FilterChips, Pill, Toolbar, TwoLine, type Column } from "./layout";

const roleDesc = (role: TeamRole) => TEAM_ROLES.find((r) => r.role === role)?.desc ?? "";
const validEmail = (v: string) => /^\S+@\S+\.\S+$/.test(v);

const ROLE_ICONS: Record<TeamRole, typeof UserRound> = {
  "Opérateur": UserRound,
  "KYC": ScanFace,
  "Marketing": Megaphone,
  "Support": Headphones,
  "Conformité": ShieldCheck,
  "Admin": BadgeCheck,
};

/** Choix du rôle : une liste à puces radio, chaque rôle avec ce qu'il permet. */
function RolePicker({ value, onChange }: { value: TeamRole; onChange: (r: TeamRole) => void }) {
  return (
    <div role="radiogroup" aria-label="Rôle" style={{ borderTop: `1px solid ${C.bds}` }}>
      {TEAM_ROLES.map((r) => {
        const Icon = ROLE_ICONS[r.role];
        const on = value === r.role;
        return (
          <button key={r.role} type="button" role="radio" aria-checked={on} className="ui-row" onClick={() => onChange(r.role)}
            style={{
              all: "unset", boxSizing: "border-box", width: "100%", display: "flex", alignItems: "flex-start", gap: 12, padding: "12px 4px",
              borderBottom: `1px solid ${C.bds}`, cursor: "pointer", fontFamily: FONT,
            }}>
            <Icon style={{ width: 16, height: 16, marginTop: 2, color: on ? C.t1 : C.t3, flexShrink: 0 }} strokeWidth={1.8} />
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: "block", fontSize: 13.5, color: C.t1 }}>{r.role}</span>
              <span style={{ display: "block", marginTop: 2, fontSize: 12.5, lineHeight: 1.5, color: C.t3 }}>{r.desc}</span>
            </span>
            <span aria-hidden style={{
              width: 16, height: 16, marginTop: 2, borderRadius: 99, flexShrink: 0, boxSizing: "border-box",
              border: on ? `5px solid ${C.t1}` : `1.5px solid ${C.bd}`,
            }} />
          </button>
        );
      })}
    </div>
  );
}

type Filter = "all" | TeamRole;

const TeamPanel = () => {
  const [members, setMembers] = useState<LiveTeamMember[]>(() => peek<LiveTeamMember[]>("team")?.value ?? []);
  const [loading, setLoading] = useState(() => !peek("team"));
  const [filter, setFilter] = useState<Filter>("all");

  const [adding, setAdding] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<TeamRole>("Opérateur");
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteMsg, setInviteMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const [editing, setEditing] = useState<LiveTeamMember | null>(null);
  const [editRole, setEditRole] = useState<TeamRole>("Opérateur");
  const [confirmRemove, setConfirmRemove] = useState(false);

  useEffect(() => {
    fetchCached("team", fetchTeam).then((m) => { setMembers(m); setLoading(false); });
  }, []);
  useEffect(() => { if (!loading) put("team", members); }, [members, loading]);

  const openEdit = (m: LiveTeamMember) => { setEditing(m); setEditRole(m.role); setConfirmRemove(false); };

  const saveRole = () => {
    if (!editing || editRole === editing.role) { setEditing(null); return; }
    const { userId } = editing;
    setMembers((prev) => prev.map((m) => (m.userId === userId ? { ...m, role: editRole } : m)));
    setEditing(null);
    setMemberRole(userId, editRole).then((res) => { if (res.error) fetchTeam().then(setMembers); });
  };

  const handleRemove = () => {
    if (!editing) return;
    const { userId } = editing;
    setMembers((prev) => prev.filter((m) => m.userId !== userId));
    setEditing(null);
    removeMember(userId).then((res) => { if (res.error) fetchTeam().then(setMembers); });
  };

  const invite = async () => {
    if (inviteBusy || !validEmail(inviteEmail)) return;
    setInviteBusy(true);
    setInviteMsg(null);
    const res = await addRoleByEmail(inviteEmail, inviteRole);
    setInviteBusy(false);
    if (res.error) { setInviteMsg({ ok: false, text: res.error }); return; }
    setInviteMsg({ ok: true, text: `${inviteEmail} ajouté·e comme ${inviteRole}.` });
    setInviteEmail("");
    fetchTeam().then(setMembers);
  };

  const counts = members.reduce<Record<string, number>>((acc, m) => { acc[m.role] = (acc[m.role] ?? 0) + 1; return acc; }, {});
  const rows = filter === "all" ? members : members.filter((m) => m.role === filter);

  const columns: Column<LiveTeamMember>[] = [
    { key: "who", header: "Membre", sort: (m) => m.name, render: (m) => <TwoLine lead={<Avatar name={m.name} />} primary={m.name} secondary={m.email} /> },
    { key: "role", header: "Rôle", sort: (m) => m.role, render: (m) => <Pill tone={m.role === "Admin" ? "strong" : "neutral"}>{m.role}</Pill> },
    { key: "access", header: "Accès", hideBelow: 960, render: (m) => <span style={{ color: C.t3 }}>{roleDesc(m.role)}</span> },
    { key: "go", header: "", align: "right", width: 40, render: () => <ChevronRight style={{ width: 16, height: 16, color: C.t3 }} /> },
  ];

  return (
    <div>
      <TeamHero loading={loading} members={members.map((m) => ({ name: m.name, role: m.role }))} />
      <Toolbar style={{ marginTop: 0 }} right={
        <Button variant="primary" size="sm" icon={<UserPlus style={{ width: 14, height: 14 }} />} onClick={() => { setAdding(true); setInviteMsg(null); }}>
          Ajouter un membre
        </Button>
      }>
        <FilterChips value={filter} onChange={setFilter} options={[
          { id: "all", label: "Tous", count: members.length },
          ...TEAM_ROLES.filter((r) => counts[r.role]).map((r) => ({ id: r.role as Filter, label: r.role, count: counts[r.role] })),
        ]} />
      </Toolbar>

      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(m) => m.userId}
        onRowClick={openEdit}
        selectedKey={editing?.userId}
        initialSort={{ key: "who", dir: "asc" }}
        empty={<EmptyState icon={Users} title={loading ? "Chargement…" : "Aucun membre"} text={loading ? undefined : "Ajoutez un premier membre à l'équipe."} />}
        mobile={(m) => (
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}><TwoLine lead={<Avatar name={m.name} size={34} />} primary={m.name} secondary={m.email} /></div>
            <Pill tone={m.role === "Admin" ? "strong" : "neutral"}>{m.role}</Pill>
          </div>
        )}
      />

      {adding && (
        <SidePanel title="Ajouter un membre" subtitle="Attribuer un rôle à un compte Ooble existant" onClose={() => setAdding(false)}
          footer={<>
            <Button variant="ghost" onClick={() => setAdding(false)}>Fermer</Button>
            <Button variant="primary" disabled={inviteBusy || !validEmail(inviteEmail)} onClick={invite}>{inviteBusy ? "Attribution…" : "Attribuer le rôle"}</Button>
          </>}>
          <p style={{ margin: "0 0 20px", fontSize: 13, lineHeight: 1.6, color: C.t2 }}>
            La personne crée d'abord son compte Ooble normalement, puis vous lui attribuez son rôle ici avec son courriel.
          </p>
          <Field label="Courriel du compte">
            <TextInput type="email" spellCheck={false} autoCapitalize="none" autoFocus placeholder="prenom@exemple.ca"
              value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void invite(); }} />
          </Field>
          <p style={{ margin: "24px 0 8px", fontSize: 12.5, color: C.t2 }}>Rôle</p>
          <RolePicker value={inviteRole} onChange={setInviteRole} />
          {inviteMsg && <div style={{ marginTop: 16 }}><Notice tone={inviteMsg.ok ? "ok" : "err"}>{inviteMsg.text}</Notice></div>}
        </SidePanel>
      )}

      {editing && (
        <SidePanel title={editing.name} subtitle={editing.email} onClose={() => setEditing(null)}
          footer={<>
            <Button variant="ghost" onClick={() => setEditing(null)}>Annuler</Button>
            <Button variant="primary" disabled={editRole === editing.role} onClick={saveRole}>Enregistrer</Button>
          </>}>
          <p style={{ margin: "0 0 8px", fontSize: 12.5, color: C.t2 }}>Rôle</p>
          <RolePicker value={editRole} onChange={setEditRole} />

          <div style={{ marginTop: 32, paddingTop: 20, borderTop: `1px solid ${C.bds}` }}>
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
