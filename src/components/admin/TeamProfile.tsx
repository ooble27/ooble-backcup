import { useRef, useState } from "react";
import { ArrowRight, Check, ImagePlus, RefreshCw } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { NAME_COLORS, PRESENCE_LABEL, TEAM_COLORS, memberById, resizePhoto, saveProfile, type AvatarBg, type NameColor, type Presence } from "@/lib/teamSpace";
import { C } from "./adminTheme";
import { Button, Notice, SidePanel } from "./ui";
import { GR_CSS, Opts } from "./GrowthPanel";
import { AVATAR_BG, TV_CSS, TeamAvatar, TeamName, avatarUri, nameColor, useMembers } from "./TeamViews";

/**
 * Mon profil d'équipe : le dessin (ou une photo), le fond de l'avatar, la couleur de mon nom et mon
 * statut. Le dessin et le fond clair d'origine restent les choix par défaut, toujours proposés.
 */

const CSS = `
.tp-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(58px, 1fr)); gap: 10px; }
.tp-pick { all: unset; cursor: pointer; position: relative; border-radius: 99px; display: inline-flex; justify-content: center; transition: transform .15s; }
@media (hover: hover) { .tp-pick:hover { transform: translateY(-2px); } }
.tp-pick[aria-pressed="true"] img, .tp-pick[aria-pressed="true"] .tp-sw { box-shadow: 0 0 0 2px var(--a-bg), 0 0 0 4px var(--a-t1); }
.tp-pick:focus-visible { outline: 2px solid var(--a-accent); outline-offset: 3px; }
.tp-sw { width: 34px; height: 34px; border-radius: 99px; display: inline-flex; align-items: center; justify-content: center; box-shadow: 0 0 0 1px var(--a-bds); }
.tp-h { margin: 26px 0 10px; font-size: 10.5px; font-weight: 500; letter-spacing: .12em; text-transform: uppercase; color: var(--a-t3); }
`;

const SIDE_CSS = `
.sb-me { all: unset; box-sizing: border-box; cursor: pointer; display: flex; align-items: center; gap: 12px; flex: 1; min-width: 0; padding: 6px 8px 6px 0; border-radius: 12px; -webkit-tap-highlight-color: transparent; }
.sb-me[data-compact="true"] { flex: none; padding: 4px; margin: 0; border-radius: 99px; }
@media (hover: hover) { .sb-me:hover .tv-name { text-decoration: underline; text-underline-offset: 3px; text-decoration-thickness: 1px; } }
.sb-me:focus-visible { outline: 2px solid var(--a-accent); outline-offset: 2px; }
`;

/** En haut de la barre latérale : la personne connectée (avatar, nom, poste). Un clic ouvre son profil. */
export function SideIdentity({ compact, role, hint }: { compact: boolean; role: string; hint?: string }) {
  const { user } = useAuth();
  useMembers(); // se redessine quand le profil change
  const [open, setOpen] = useState(false);
  const me = user?.id ?? "";
  const name = memberById(me)?.name || user?.name || user?.email || "Vous";
  const tip = [`${name} · ${role}`, hint, "Modifier mon profil"].filter(Boolean).join("\n");
  const line: React.CSSProperties = { display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" };
  return (
    <>
      <style>{TV_CSS + SIDE_CSS}</style>
      <button type="button" className="sb-me" data-compact={compact} title={tip} aria-label="Modifier mon profil" onClick={() => setOpen(true)}>
        <span style={{ display: "inline-flex", pointerEvents: "none" }}><TeamAvatar id={me} name={name} size={compact ? 38 : 36} presence /></span>
        {!compact && (
          <span style={{ flex: 1, minWidth: 0, pointerEvents: "none" }}>
            <TeamName id={me} name={name} style={{ ...line, fontSize: 14.5, lineHeight: 1.25 }} />
            <span style={{ ...line, marginTop: 2, fontSize: 12.5, lineHeight: 1.3, color: C.t3 }}>{role}</span>
          </span>
        )}
      </button>
      {open && <ProfilePanel onClose={() => setOpen(false)} />}
    </>
  );
}

const BGS: { v: AvatarBg; label: string }[] = [{ v: "light", label: "Clair (d'origine)" }, ...TEAM_COLORS.map((c) => ({ v: c.v as AvatarBg, label: c.label }))];

export function ProfilePanel({ onClose }: { onClose: () => void }) {
  const { user } = useAuth();
  const me = user?.id ?? "";
  const m = memberById(me);
  const [seed, setSeed] = useState<string | null>(m?.seed ?? null);
  const [photo, setPhoto] = useState<string | null>(m?.photo ?? null);
  const [bg, setBg] = useState<AvatarBg>(m?.bg ?? "light");
  const [color, setColor] = useState<NameColor>(m?.color ?? "coral");
  const [status, setStatus] = useState<Presence>(m?.status ?? "available");
  const [until, setUntil] = useState(m?.statusUntil ?? "");
  const [note, setNote] = useState(m?.statusNote ?? "");
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const name = m?.name ?? user?.name ?? "Vous";

  // Le dessin d'origine en premier, puis des propositions tirées de mon identifiant.
  const seeds = [...(page === 0 ? [null] : []), ...Array.from({ length: page === 0 ? 15 : 16 }, (_, i) => `${me}:${page * 16 + i + 1}`)];
  const pickPhoto = async (f: File | undefined) => {
    if (!f) return;
    setErr(null);
    try { setPhoto(await resizePhoto(f)); } catch (e) { setErr((e as Error).message); }
    if (file.current) file.current.value = "";
  };
  const save = async () => {
    setBusy(true); setErr(null);
    const r = await saveProfile({ seed, photo, bg, color, status, statusUntil: status === "away" && until ? until : null, statusNote: status === "available" ? "" : note });
    setBusy(false);
    if (r.error) setErr(r.error); else onClose();
  };

  return (
    <SidePanel title="Mon profil d'équipe" subtitle="Comment l'équipe vous voit dans les notes, les tâches et Mon espace" onClose={onClose} width={560}
      footer={<><Button variant="ghost" onClick={onClose}>Annuler</Button><button type="button" className="tv-go" disabled={busy || (status === "away" && !until)} onClick={save}>{busy ? "Enregistrement…" : "Enregistrer"} <ArrowRight style={{ width: 15, height: 15 }} /></button></>}>
      <style>{TV_CSS + GR_CSS + CSS}</style>

      {/* Aperçu */}
      <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
        <TeamAvatar id={me} name={name} size={84} preview={{ seed, photo, bg }} />
        <div style={{ minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 22, fontWeight: 600, letterSpacing: "-0.03em", color: nameColor(color), overflowWrap: "anywhere" }}>{name}</p>
          <p style={{ margin: "4px 0 0", fontSize: 13.5, color: C.t2 }}>
            <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 99, marginRight: 7, background: status === "available" ? "var(--a-sage)" : status === "busy" ? "var(--a-sun)" : "var(--a-t3)" }} />
            {PRESENCE_LABEL[status]}{status === "away" && until ? ` jusqu'au ${new Date(`${until}T12:00:00`).toLocaleDateString("fr-CA", { day: "numeric", month: "long" })}` : ""}{status !== "available" && note.trim() ? ` · ${note.trim()}` : ""}
          </p>
        </div>
      </div>

      {/* Dessin ou photo */}
      <p className="tp-h">Mon avatar</p>
      <div className="tp-grid">
        {seeds.map((s) => (
          <button key={s ?? "origine"} type="button" className="tp-pick" aria-pressed={!photo && seed === s} title={s === null ? "Dessin d'origine" : "Choisir ce dessin"}
            onClick={() => { setSeed(s); setPhoto(null); }}>
            <img src={avatarUri(s ?? me)} alt="" width={52} height={52} style={{ width: 52, height: 52, borderRadius: 99, background: AVATAR_BG[bg], boxShadow: "0 0 0 1px var(--a-bds)" }} />
          </button>
        ))}
      </div>
      <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "center", marginTop: 14 }}>
        <button type="button" className="tv-link" style={{ fontSize: 13.5, display: "inline-flex", alignItems: "center", gap: 6 }} onClick={() => setPage((p) => p + 1)}>
          <RefreshCw style={{ width: 14, height: 14 }} />D'autres propositions
        </button>
        {page > 0 && <button type="button" className="tv-link" style={{ fontSize: 13.5 }} onClick={() => setPage(0)}>Revenir au dessin d'origine</button>}
        <input ref={file} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => pickPhoto(e.target.files?.[0])} />
        <button type="button" className="tv-link" style={{ fontSize: 13.5, display: "inline-flex", alignItems: "center", gap: 6 }} onClick={() => file.current?.click()}>
          <ImagePlus style={{ width: 14, height: 14 }} />{photo ? "Changer de photo" : "Importer ma photo"}
        </button>
        {photo && <button type="button" className="tv-link" style={{ fontSize: 13.5 }} onClick={() => setPhoto(null)}>Retirer la photo</button>}
      </div>

      {/* Fond de l'avatar */}
      <p className="tp-h">Fond de l'avatar</p>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {BGS.map((b) => (
          <button key={b.v} type="button" className="tp-pick" aria-pressed={bg === b.v} title={b.label} aria-label={b.label} onClick={() => setBg(b.v)}>
            <span className="tp-sw" style={{ background: AVATAR_BG[b.v], color: "#14110f" }}>{bg === b.v && <Check style={{ width: 15, height: 15 }} strokeWidth={2.6} />}</span>
          </button>
        ))}
      </div>
      <p style={{ margin: "8px 0 0", fontSize: 12.5, color: C.t3 }}>{BGS.find((b) => b.v === bg)?.label}</p>

      {/* Couleur du nom */}
      <p className="tp-h">Couleur de mon nom</p>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {NAME_COLORS.map((c) => (
          <button key={c.v} type="button" className="tp-pick" aria-pressed={color === c.v} title={c.label} aria-label={c.label} onClick={() => setColor(c.v)}>
            <span className="tp-sw" style={{ background: nameColor(c.v), color: "var(--a-bg)" }}>{color === c.v && <Check style={{ width: 15, height: 15 }} strokeWidth={2.6} />}</span>
          </button>
        ))}
      </div>
      <p style={{ margin: "8px 0 0", fontSize: 12.5, color: C.t3 }}>
        {color === "white"
          ? "Blanc (d'origine) : blanc en mode sombre, noir en mode clair pour rester lisible."
          : `${NAME_COLORS.find((c) => c.v === color)?.label} : votre nom s'affiche dans cette couleur pour toute l'équipe.`}
      </p>

      {/* Statut */}
      <p className="tp-h">Mon statut</p>
      <p style={{ margin: 0, fontSize: 15, lineHeight: 2, color: C.t2 }}>
        <Opts value={status} onChange={setStatus} options={(Object.keys(PRESENCE_LABEL) as Presence[]).map((p) => ({ v: p, label: PRESENCE_LABEL[p] }))} />
      </p>
      {status !== "available" && (
        <div style={{ display: "grid", gap: 16, gridTemplateColumns: status === "away" ? "160px minmax(0, 1fr)" : "minmax(0, 1fr)", marginTop: 10 }}>
          {status === "away" && (
            <label><span style={{ fontSize: 12.5, color: C.t3 }}>Jusqu'au</span>
              <input className="gr-in" type="date" value={until} min={new Date().toLocaleDateString("en-CA", { timeZone: "America/Toronto" })} onChange={(e) => setUntil(e.target.value)} /></label>
          )}
          <label><span style={{ fontSize: 12.5, color: C.t3 }}>Message (facultatif)</span>
            <input className="gr-in" value={note} maxLength={80} onChange={(e) => setNote(e.target.value)} placeholder={status === "away" ? "Ex. En congé" : "Ex. En réunion jusqu'à 15 h"} /></label>
        </div>
      )}
      {status === "away" && !until && <p style={{ margin: "8px 0 0", fontSize: 12.5, color: C.t3 }}>Indiquez jusqu'à quand : vous redevenez « Disponible » tout seul le lendemain.</p>}
      {err && <div style={{ marginTop: 16 }}><Notice tone="err">{err}</Notice></div>}
    </SidePanel>
  );
}
