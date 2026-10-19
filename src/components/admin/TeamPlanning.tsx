import { useCallback, useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { useAuth } from "@/lib/auth";
import {
  DOW_LABEL, DOW_SHORT, currentShift, firstName, openActivity, peekTeam, hourLabel, loadShifts, nowMontreal, openMember, setShift, shiftLabel, todayToronto,
  type Shift, type TeamMember,
} from "@/lib/teamSpace";
import { C } from "./adminTheme";
import { Notice, SidePanel } from "./ui";
import { GR_CSS, Opts } from "./GrowthPanel";
import { TeamAvatar, TeamName, TV_CSS, nameColor, useMembers, useTeamLive } from "./TeamViews";

/**
 * Planning de garde : les heures de chacun, jour par jour (heure de Montréal). Toute l'équipe le voit ; les
 * administrateurs le remplissent. « De garde maintenant » : dans ses heures et pas absent. Les alertes de
 * commandes à prendre vont d'abord aux personnes de garde.
 */

const away = (m: TeamMember | undefined) => !!m && m.status === "away" && (!m.statusUntil || m.statusUntil >= todayToronto());

/** Le planning, tenu à jour en direct. */
export function useShifts() {
  const [shifts, setShifts] = useState<Shift[] | null>(() => peekTeam<Shift[]>("shifts") ?? null);
  const load = useCallback(() => { loadShifts().then(setShifts).catch(() => setShifts([])); }, []);
  useEffect(() => { load(); }, [load]);
  useTeamLive(load, ["team_shifts", "team_profiles"]);
  return { shifts, reload: load };
}

/** Qui est de garde en ce moment (avec l'heure de fin de sa plage). */
export function onCallNow(shifts: Shift[], members: TeamMember[]) {
  return members.map((m) => ({ m, s: away(m) ? null : currentShift(shifts, m.userId) })).filter((x): x is { m: TeamMember; s: Shift } => !!x.s);
}

/** Mon espace : « De garde maintenant : Awa jusqu'à 17 h » et le lien vers le planning. */
export function OnCallLine() {
  const { user } = useAuth();
  const me = user?.id ?? "";
  const members = useMembers();
  const { shifts, reload } = useShifts();
  const [open, setOpen] = useState(false);
  const [, tick] = useState(0);
  // La garde change avec l'heure : on relit l'heure chaque minute.
  useEffect(() => { const t = window.setInterval(() => tick((n) => n + 1), 60_000); return () => window.clearInterval(t); }, []);
  if (!shifts) return null;
  const now = onCallNow(shifts, members);
  const mine = now.find(({ m }) => m.userId === me);
  const others = now.filter(({ m }) => m.userId !== me);
  return (
    <div className="oc">
      <style>{`
.oc { margin-bottom: 26px; }
.oc-now { margin: 0; display: flex; align-items: center; gap: 10px; font-size: 14px; line-height: 1.45; color: var(--a-t2); }
.oc-links { margin: 10px 0 0; display: flex; gap: 22px; flex-wrap: wrap; }
`}</style>
      <p className="oc-now">
        {now.length > 0 && <span className="tv-stack" style={{ flexShrink: 0 }}>{now.slice(0, 3).map(({ m }) => <TeamAvatar key={m.userId} id={m.userId} name={m.name} size={26} presence />)}</span>}
        <span style={{ minWidth: 0 }}>
          {/* Pour soi : « Vous êtes de garde » ; pour les autres, leur prénom. */}
          {mine && <>Vous êtes de garde jusqu'à {hourLabel(mine.s.ends)}{others.length ? ", avec " : "."}</>}
          {!mine && others.length > 0 && "De garde : "}
          {others.map(({ m, s }, i) => (
            <span key={m.userId}>{i > 0 && ", "}<TeamName id={m.userId} name={firstName(m.name)} style={{ fontWeight: 500 }} /> jusqu'à {hourLabel(s.ends)}</span>
          ))}
          {!mine && others.length > 0 && "."}
          {now.length === 0 && (shifts.length ? "Personne n'est de garde en ce moment." : "Aucun planning de garde pour l'instant.")}
        </span>
      </p>
      <p className="oc-links">
        <button type="button" className="ms-link" onClick={() => setOpen(true)}>Planning <ArrowRight style={{ width: 14, height: 14 }} /></button>
        <button type="button" className="ms-link" onClick={openActivity}>Activité de l'équipe <ArrowRight style={{ width: 14, height: 14 }} /></button>
      </p>
      {open && <PlanningPanel shifts={shifts} onChanged={reload} onClose={() => setOpen(false)} />}
    </div>
  );
}

/** Le planning de la semaine : grille sur ordinateur, un jour à la fois sur téléphone. */
export function PlanningPanel({ shifts, onChanged, onClose }: { shifts: Shift[]; onChanged: () => void; onClose: () => void }) {
  const { isAdmin } = useAuth();
  const members = useMembers();
  const today = nowMontreal().dow;
  const [day, setDay] = useState(String(today));
  const [edit, setEdit] = useState<{ userId: string; dow: number; starts: string; ends: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const at = (userId: string, dow: number) => shifts.find((s) => s.userId === userId && s.dow === dow) ?? null;
  const startEdit = (userId: string, dow: number) => {
    if (!isAdmin) return;
    const s = at(userId, dow);
    setErr(null);
    setEdit({ userId, dow, starts: s?.starts ?? "09:00", ends: s?.ends ?? "17:00" });
  };
  const save = async (off: boolean) => {
    if (!edit) return;
    setBusy(true); setErr(null);
    const r = await setShift(edit.userId, edit.dow, off ? null : edit.starts, off ? null : edit.ends);
    setBusy(false);
    if (r.error) { setErr(r.error); return; }
    setEdit(null); onChanged();
  };
  const cell = (m: TeamMember, dow: number) => {
    const s = at(m.userId, dow);
    const live = !away(m) && currentShift(shifts, m.userId)?.dow === dow;
    const editing = edit?.userId === m.userId && edit.dow === dow;
    return (
      <button key={dow} type="button" className="tp-cell" data-today={dow === today} data-live={live} data-editing={editing} disabled={!isAdmin}
        onClick={() => startEdit(m.userId, dow)} title={isAdmin ? `${DOW_LABEL[dow]} · ${firstName(m.name)} : modifier` : undefined}>
        {s ? <span className="tp-band" style={{ background: `color-mix(in srgb, ${nameColor(m.color)} 24%, transparent)`, color: C.t1 }}>{hourLabel(s.starts)}<br />{hourLabel(s.ends)}</span>
          : <span style={{ color: C.t3 }}>—</span>}
      </button>
    );
  };

  return (
    <SidePanel title="Planning de garde" subtitle={isAdmin ? "Touchez une case pour changer les heures · heure de Montréal" : "Les heures de chacun · heure de Montréal"} onClose={onClose} width={860}>
      <style>{TV_CSS + GR_CSS + `
.tp-grid { display: grid; grid-template-columns: minmax(120px, 1.3fr) repeat(7, minmax(0, 1fr)); align-items: stretch; }
.tp-h { padding: 8px 4px; font-size: 12px; color: var(--a-t3); text-align: center; }
.tp-h[data-today="true"] { color: var(--a-t1); font-weight: 600; text-decoration: underline; text-underline-offset: 4px; }
.tp-who { display: flex; align-items: center; gap: 8px; min-width: 0; padding: 8px 0; border-top: 1px solid var(--a-bds); cursor: pointer; }
.tp-cell { all: unset; box-sizing: border-box; display: flex; align-items: center; justify-content: center; min-height: 54px; padding: 4px; border-top: 1px solid var(--a-bds); font-size: 12px; line-height: 1.3; text-align: center; font-variant-numeric: tabular-nums; cursor: pointer; }
.tp-cell:disabled { cursor: default; }
.tp-cell[data-today="true"] { background: var(--a-hover3); }
.tp-band { display: block; width: 100%; padding: 6px 2px; border-radius: 8px; }
.tp-cell[data-live="true"] .tp-band { box-shadow: inset 0 0 0 1.5px var(--a-t1); }
.tp-cell[data-editing="true"] .tp-band, .tp-cell[data-editing="true"] > span { outline: 2px solid var(--a-t1); outline-offset: 2px; border-radius: 8px; }
.tp-cell:focus-visible { outline: 2px solid var(--a-accent); outline-offset: -2px; }
.tp-phone { display: none; }
@media (max-width: 700px) { .tp-grid { display: none; } .tp-phone { display: block; } }
`}</style>

      {/* Ordinateur et tablette : la semaine en grille. */}
      <div className="tp-grid">
        <span />
        {[1, 2, 3, 4, 5, 6, 7].map((d) => <span key={d} className="tp-h" data-today={d === today}>{DOW_SHORT[d]}</span>)}
        {members.map((m) => (
          <div key={m.userId} style={{ display: "contents" }}>
            <span className="tp-who" onClick={() => openMember(m.userId)} title={`Voir la fiche de ${m.name}`}>
              <TeamAvatar id={m.userId} name={m.name} size={28} presence />
              <TeamName id={m.userId} name={firstName(m.name)} style={{ fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} />
            </span>
            {[1, 2, 3, 4, 5, 6, 7].map((d) => cell(m, d))}
          </div>
        ))}
      </div>

      {/* Téléphone : un jour à la fois. */}
      <div className="tp-phone">
        <p style={{ margin: "0 0 6px", fontSize: 15, lineHeight: 2, color: C.t2 }}>
          <Opts value={day} onChange={setDay} options={[1, 2, 3, 4, 5, 6, 7].map((d) => ({ v: String(d), label: d === today ? `${DOW_SHORT[d]} (auj.)` : DOW_SHORT[d] }))} />
        </p>
        {members.map((m) => {
          const s = at(m.userId, Number(day));
          return (
            <button key={m.userId} type="button" className="tv-row" disabled={!isAdmin} onClick={() => startEdit(m.userId, Number(day))}
              style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", padding: "11px 0", borderBottom: `1px solid ${C.bds}`, textAlign: "left" }}>
              <TeamAvatar id={m.userId} name={m.name} size={30} presence />
              <TeamName id={m.userId} name={firstName(m.name)} style={{ flex: 1, minWidth: 0, fontSize: 14.5 }} />
              <span style={{ fontSize: 14, color: s ? C.t1 : C.t3, fontVariantNumeric: "tabular-nums" }}>{s ? shiftLabel(s) : "Pas de garde"}</span>
            </button>
          );
        })}
      </div>

      {members.length === 0 && <p style={{ margin: 0, fontSize: 14, color: C.t3 }}>Chargement de l'équipe…</p>}

      {edit && (
        <div style={{ marginTop: 20, paddingTop: 16, borderTop: `1px solid ${C.bd}` }}>
          <p style={{ margin: 0, fontSize: 14.5, color: C.t1 }}>
            {firstName(members.find((x) => x.userId === edit.userId)?.name ?? "")} · {DOW_LABEL[edit.dow].toLowerCase()}
          </p>
          <div style={{ display: "flex", gap: 16, alignItems: "flex-end", flexWrap: "wrap", marginTop: 8 }}>
            <label><span style={{ display: "block", fontSize: 12.5, color: C.t3 }}>De</span>
              <input className="gr-in" type="time" step={900} value={edit.starts} onChange={(e) => setEdit({ ...edit, starts: e.target.value })} style={{ width: 130 }} /></label>
            <label><span style={{ display: "block", fontSize: 12.5, color: C.t3 }}>À</span>
              <input className="gr-in" type="time" step={900} value={edit.ends} onChange={(e) => setEdit({ ...edit, ends: e.target.value })} style={{ width: 130 }} /></label>
            <button type="button" className="tv-go" disabled={busy || !edit.starts || !edit.ends || edit.starts === edit.ends} onClick={() => save(false)}>
              {busy ? "Enregistrement…" : "Enregistrer"} <ArrowRight style={{ width: 14, height: 14 }} />
            </button>
            {at(edit.userId, edit.dow) && <button type="button" className="tv-link" style={{ fontSize: 14 }} disabled={busy} onClick={() => save(true)}>Pas de garde ce jour-là</button>}
            <button type="button" className="tv-link" style={{ fontSize: 14 }} onClick={() => setEdit(null)}>Annuler</button>
          </div>
          {edit.starts > edit.ends && edit.ends && <p style={{ margin: "8px 0 0", fontSize: 12.5, color: C.t3 }}>Garde de nuit : elle se termine le lendemain à {hourLabel(edit.ends)}.</p>}
        </div>
      )}
      {err && <div style={{ marginTop: 14 }}><Notice tone="err">{err}</Notice></div>}
      <p style={{ margin: "20px 0 0", fontSize: 12.5, color: C.t3, lineHeight: 1.55 }}>
        Les alertes « commande à prendre » vont d'abord aux opérateurs et administrateurs de garde ; s'il n'y en a aucun, à tous.
        Une personne en statut « Absent » n'est pas de garde, même dans ses heures.
      </p>
    </SidePanel>
  );
}

