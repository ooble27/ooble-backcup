/**
 * Marketing › Notifications : les notifications push sur le téléphone des clients, et les
 * messages en haut de l'accueil de l'app. Même esprit que le reste du marketing : de grandes
 * phrases, des textes soulignés, tout à plat. Rien ne part vers les clients tant que « Envois aux
 * clients » est coupé : l'équipe reçoit et voit tout, pour tester en vrai.
 */
import { useCallback, useEffect, useState } from "react";
import { ArrowRight, BellRing, Megaphone } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { peek, put } from "@/lib/adminCache";
import {
  APP_LINKS, AUDIENCES, audienceLabel, cancelPush, countAudience, createMessage, createPush, linkLabel, loadNotifications, setMessageActive,
  type Audience, type AudienceCount, type MessageRow, type NotifStats, type PushRow,
} from "@/lib/notifications";
import { C } from "./adminTheme";
import { Button, SidePanel } from "./ui";
import { ST_CSS } from "./settingsUi";
import { MS_CSS, Opts } from "./SettingsMailStudio";
import { ControlLine, MK_CSS, useMarketingSettings } from "./MarketingPanels";

const nf = new Intl.NumberFormat("fr-CA");
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);
const when = (iso: string) => new Date(iso).toLocaleString("fr-CA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const plural = (n: number, one: string, many = `${one}s`) => `${nf.format(n)} ${n > 1 ? many : one}`;

type Data = { push: PushRow[]; messages: MessageRow[]; stats: NotifStats };

export function NotificationsPanel({ onControl }: { onControl: () => void }) {
  const { s } = useMarketingSettings();
  const [d, setD] = useState<Data | null>(() => peek<Data>("nt.all")?.value ?? null);
  const [err, setErr] = useState<string | null>(null);
  const [compose, setCompose] = useState<"push" | "message" | null>(null);
  const [subs, setSubs] = useState<AudienceCount | null>(null);
  const reload = useCallback(() => {
    loadNotifications().then((v) => { setD(v); put("nt.all", v); setErr(null); }).catch((e) => setErr(e.message));
    countAudience("all").then(setSubs).catch(() => {});
  }, []);
  useEffect(reload, [reload]);
  // Une notification en cours d'envoi se met à jour toute seule.
  useEffect(() => {
    if (!d?.push.some((p) => p.status === "sending" || (p.status === "scheduled" && new Date(p.scheduledAt).getTime() <= Date.now()))) return;
    const id = window.setInterval(reload, 6000);
    return () => window.clearInterval(id);
  }, [d, reload]);

  const now = Date.now();
  const live = (d?.messages ?? []).filter((m) => m.active && new Date(m.startsAt).getTime() <= now && (!m.endsAt || new Date(m.endsAt).getTime() > now));

  return (
    <div>
      <style>{ST_CSS + MS_CSS + MK_CSS}</style>
      <p style={{ margin: 0, fontSize: 14, color: C.coral }}>Marketing · notifications</p>
      <h1 className="mk-hero" style={{ marginTop: 14 }}>
        Parlez aux clients <span style={{ color: C.sun }}>sur leur téléphone</span> <span className="mute">et</span> <span style={{ color: C.sage }}>dans l'app</span>
        <span className="mute">.{s && !s.clientSends ? " Pour l'instant, seule l'équipe reçoit." : ""}</span>
      </h1>
      <p className="mk-lead">
        {subs ? <>{plural(subs.reachable, "personne a", "personnes ont")} activé les notifications, sur {plural(subs.devices, "téléphone")}. </> : null}
        Un message dans l'app est vu par tout le monde à l'ouverture de l'accueil, notifications activées ou non.
      </p>
      <ControlLine s={s} onOpen={onControl} />
      {err && <p style={{ marginTop: 14, fontSize: 13.5, color: C.coral }}>{err}</p>}

      <section className="mk-sec">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 16, flexWrap: "wrap" }}>
          <div>
            <h2 className="mk-h">Notifications push</h2>
            <p className="mk-sub">Une alerte sur l'écran du téléphone, même app fermée. Touchée, elle ouvre l'app à la page choisie.</p>
          </div>
          <Button variant="primary" icon={<BellRing style={{ width: 16, height: 16 }} />} onClick={() => setCompose("push")}>Nouvelle notification</Button>
        </div>
        {d && d.push.length === 0 && <p style={{ margin: "18px 0 0", fontSize: 14, color: C.t3 }}>Aucune notification pour l'instant.</p>}
        <div className="mk-list">
          {(d?.push ?? []).map((p) => {
            const taps = d?.stats.push[p.id] ?? 0;
            const future = p.status === "scheduled" && new Date(p.scheduledAt).getTime() > now;
            return (
              <div key={p.id} className="mk-item" style={{ cursor: "default", alignItems: "flex-start" }}>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span className="n">{p.titleFr}</span>
                  <span className="d">{p.bodyFr}</span>
                  <span className="d" style={{ marginTop: 6 }}>
                    {when(p.scheduledAt)} · {audienceLabel(p.audience)} · vers {linkLabel(p.url)}
                    {p.status === "sent" && <> · <span style={{ color: C.t1 }}>{plural(p.sent, "téléphone")}</span>{p.sent > 0 && <>, <span style={{ color: C.sage }}>{plural(taps, "touchée", "touchées")}</span> ({pct(taps, p.people)} %)</>}</>}
                    {p.status === "sent" && p.blocked > 0 && <> · <span style={{ color: C.coral }}>{nf.format(p.blocked)} retenus</span></>}
                    {p.status === "sent" && p.failed > 0 && <> · {nf.format(p.failed)} en échec</>}
                  </span>
                </span>
                <span className="v" style={{ color: p.status === "sent" ? C.sage : p.status === "cancelled" ? C.t3 : C.sun }}>
                  {p.status === "sent" ? "Envoyée" : p.status === "cancelled" ? "Annulée" : p.status === "sending" ? "En cours" : future ? (s && !s.automaticSends ? "Programmée, en attente" : "Programmée") : "En cours"}
                </span>
                {future && (
                  <button type="button" className="mk-link quiet" onClick={async () => {
                    if (!confirm("Annuler cette notification ? Elle ne partira pas.")) return;
                    const e = await cancelPush(p.id); if (e) setErr(e); reload();
                  }}>Annuler</button>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section className="mk-sec">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 16, flexWrap: "wrap" }}>
          <div>
            <h2 className="mk-h">Messages dans l'app</h2>
            <p className="mk-sub">
              {live.length ? <>{plural(live.length, "message en ligne", "messages en ligne")}. </> : "Aucun message en ligne. "}
              Le plus récent s'affiche en haut de l'accueil ; le client peut le fermer.
            </p>
          </div>
          <Button variant="primary" icon={<Megaphone style={{ width: 16, height: 16 }} />} onClick={() => setCompose("message")}>Nouveau message</Button>
        </div>
        <div className="mk-list">
          {(d?.messages ?? []).map((m) => {
            const st = d?.stats.messages[m.id] ?? { seen: 0, click: 0, dismiss: 0 };
            const ended = !!m.endsAt && new Date(m.endsAt).getTime() <= now;
            const state = ended ? ["Terminé", C.t3] : !m.active ? ["En pause", C.t3] : new Date(m.startsAt).getTime() > now ? ["À venir", C.sun] : ["En ligne", C.sage];
            return (
              <div key={m.id} className="mk-item" style={{ cursor: "default", alignItems: "flex-start" }}>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span className="n">{m.titleFr}</span>
                  {m.bodyFr && <span className="d">{m.bodyFr}</span>}
                  <span className="d" style={{ marginTop: 6 }}>
                    {audienceLabel(m.audience)}{m.url ? ` · vers ${linkLabel(m.url)}` : ""} · {m.endsAt ? `jusqu'au ${when(m.endsAt)}` : "sans fin"}
                    {" · "}<span style={{ color: C.t1 }}>vu par {nf.format(st.seen)}</span>
                    {m.url && <>, <span style={{ color: C.sage }}>{nf.format(st.click)} touché{st.click > 1 ? "s" : ""}</span></>}
                    , {nf.format(st.dismiss)} fermé{st.dismiss > 1 ? "s" : ""}
                  </span>
                </span>
                <span className="v" style={{ color: state[1] }}>{state[0]}</span>
                {!ended && (
                  <button type="button" className="mk-link quiet" onClick={async () => {
                    const e = await setMessageActive(m.id, !m.active); if (e) setErr(e); reload();
                  }}>{m.active ? "Mettre en pause" : "Remettre en ligne"}</button>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {compose === "push" && <PushComposer clientSends={!!s?.clientSends} automatic={!!s?.automaticSends} onClose={() => setCompose(null)} onDone={() => { setCompose(null); reload(); }} />}
      {compose === "message" && <MessageComposer clientSends={!!s?.clientSends} onClose={() => setCompose(null)} onDone={() => { setCompose(null); reload(); }} />}
    </div>
  );
}

/* ─── Saisie ─── */

function Line({ id, label, value, onChange, max, big, optional }: {
  id: string; label: string; value: string; onChange: (v: string) => void; max: number; big?: boolean; optional?: boolean;
}) {
  return (
    <div>
      <label className="ms-k" htmlFor={id}>{label}{optional && <span style={{ textTransform: "none", letterSpacing: 0 }}> · facultatif</span>}</label>
      <input id={id} type="text" autoComplete="off" spellCheck className={`ms-in ${big ? "big" : "body"}`} value={value} onChange={(e) => onChange(e.target.value)} />
      {value.length > max * 0.8 && <p className="st-hint" style={{ color: value.length > max ? C.coral : undefined }}>{value.length} / {max} caractères</p>}
    </div>
  );
}

function AudiencePick({ value, onPick }: { value: Audience; onPick: (a: Audience) => void }) {
  const [n, setN] = useState<AudienceCount | null>(null);
  useEffect(() => { setN(null); countAudience(value).then(setN).catch(() => {}); }, [value]);
  return (
    <div>
      <p className="ms-k" style={{ marginBottom: 8 }}>Pour qui</p>
      <Opts label="Public" value={value} onPick={onPick} options={AUDIENCES} />
      <p className="st-hint">{n ? <>{plural(n.people, "personne")}, dont {nf.format(n.reachable)} avec les notifications activées.</> : "…"}</p>
    </div>
  );
}

/** Le verrou en une phrase : à qui ça part vraiment, maintenant. */
function Reach({ clientSends, audience }: { clientSends: boolean; audience: Audience }) {
  if (audience === "staff") return <p style={{ margin: 0, fontSize: 14, color: C.t2 }}>Un essai : seule l'équipe le reçoit.</p>;
  return clientSends
    ? <p style={{ margin: 0, fontSize: 14, color: C.sage }}>Les envois aux clients sont ouverts : tout le public choisi le recevra.</p>
    : <p style={{ margin: 0, fontSize: 14, color: C.coral }}>Les envois aux clients sont coupés : seuls les membres de l'équipe dans ce public le recevront.</p>;
}

function PushComposer({ clientSends, automatic, onClose, onDone }: { clientSends: boolean; automatic: boolean; onClose: () => void; onDone: () => void }) {
  const { user } = useAuth();
  const [t, setT] = useState({ titleFr: "", bodyFr: "", titleEn: "", bodyEn: "" });
  const [url, setUrl] = useState<string>("/app");
  const [aud, setAud] = useState<Audience>("staff");
  const [timing, setTiming] = useState<"now" | "later">("now");
  const [at, setAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const tooLong = t.titleFr.length > 80 || t.bodyFr.length > 240 || t.titleEn.length > 80 || t.bodyEn.length > 240;
  const enHalf = !!t.titleEn.trim() !== !!t.bodyEn.trim();
  const later = timing === "later" ? new Date(at) : null;
  const ok = t.titleFr.trim() && t.bodyFr.trim() && !tooLong && !enHalf && (!later || (!isNaN(later.getTime()) && later.getTime() > Date.now()));

  const send = async () => {
    const who = aud === "staff" || !clientSends ? "l'équipe seulement" : audienceLabel(aud).toLowerCase();
    const whenTxt = later ? `le ${when(later.toISOString())}${automatic ? "" : " (quand les envois automatiques seront allumés)"}` : "maintenant";
    if (!confirm(`Envoyer cette notification à ${who}, ${whenTxt} ?`)) return;
    setBusy(true); setMsg(null);
    const e = await createPush({ ...t, url, audience: aud, scheduledAt: later, byName: user?.email ?? "équipe" });
    setBusy(false);
    if (e) setMsg(e); else onDone();
  };

  return (
    <SidePanel title="Nouvelle notification" subtitle="Sur l'écran du téléphone, même app fermée" onClose={onClose} width={620}
      footer={<div style={{ display: "flex", gap: 14, alignItems: "center", justifyContent: "flex-end" }}>
        {msg && <span style={{ flex: 1, fontSize: 13.5, color: C.coral }}>{msg}</span>}
        <button type="button" className="mk-link quiet" onClick={onClose}>Annuler</button>
        <Button variant="primary" disabled={!ok || busy} onClick={() => void send()}>{later ? "Programmer" : "Envoyer"}</Button>
      </div>}>
      <style>{ST_CSS + MS_CSS + MK_CSS}</style>
      <div style={{ display: "grid", gap: 28 }}>
        <Line id="pt-title" label="Titre" value={t.titleFr} onChange={(v) => setT({ ...t, titleFr: v })} max={80} big />
        <Line id="pt-body" label="Texte" value={t.bodyFr} onChange={(v) => setT({ ...t, bodyFr: v })} max={240} />
        <div>
          <p className="ms-k" style={{ marginBottom: 8 }}>Touchée, elle ouvre</p>
          <Opts label="Page ouverte" value={url} onPick={setUrl} options={APP_LINKS.map((l) => ({ id: l.id, label: l.label }))} />
        </div>
        <AudiencePick value={aud} onPick={setAud} />
        <div>
          <p className="ms-k" style={{ marginBottom: 8 }}>Quand</p>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 14 }}>
            <Opts label="Quand" value={timing} onPick={setTiming} options={[{ id: "now", label: "Maintenant" }, { id: "later", label: "Programmer" }]} />
            {timing === "later" && (
              <input type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} aria-label="Date et heure d'envoi"
                style={{ border: "none", borderBottom: `1px solid ${C.bds}`, background: "transparent", color: C.t1, font: "inherit", fontSize: 15, padding: "4px 0" }} />
            )}
          </div>
          {timing === "later" && !automatic && <p className="st-hint" style={{ color: C.sun }}>Les envois automatiques sont coupés : elle attendra qu'on les allume.</p>}
        </div>
        <div style={{ display: "grid", gap: 20 }}>
          <p className="ms-k" style={{ margin: 0 }}>En anglais, pour les téléphones en anglais</p>
          <Line id="pt-title-en" label="Title" value={t.titleEn} onChange={(v) => setT({ ...t, titleEn: v })} max={80} optional />
          <Line id="pt-body-en" label="Text" value={t.bodyEn} onChange={(v) => setT({ ...t, bodyEn: v })} max={240} optional />
          {enHalf && <p className="st-hint" style={{ margin: 0, color: C.sun }}>Remplissez le titre et le texte anglais, ou aucun des deux.</p>}
          {!t.titleEn.trim() && !t.bodyEn.trim() && <p className="st-hint" style={{ margin: 0 }}>Vide : tout le monde reçoit la version française.</p>}
        </div>
        <div>
          <p className="ms-k" style={{ marginBottom: 10 }}>Aperçu</p>
          <p style={{ margin: 0, fontSize: 13, color: C.t3 }}>Ooble · maintenant</p>
          <p style={{ margin: "4px 0 0", fontSize: 17, fontWeight: 600, color: t.titleFr ? C.t1 : C.t3 }}>{t.titleFr || "Le titre"}</p>
          <p style={{ margin: "2px 0 0", fontSize: 15, lineHeight: 1.5, color: t.bodyFr ? C.t2 : C.t3 }}>{t.bodyFr || "Le texte de la notification."}</p>
        </div>
        <Reach clientSends={clientSends} audience={aud} />
      </div>
    </SidePanel>
  );
}

function MessageComposer({ clientSends, onClose, onDone }: { clientSends: boolean; onClose: () => void; onDone: () => void }) {
  const { user } = useAuth();
  const [t, setT] = useState({ titleFr: "", bodyFr: "", ctaFr: "", titleEn: "", bodyEn: "", ctaEn: "" });
  const [url, setUrl] = useState<string>("none");
  const [aud, setAud] = useState<Audience>("staff");
  const [until, setUntil] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const tooLong = t.titleFr.length > 80 || t.bodyFr.length > 280 || t.ctaFr.length > 30 || t.titleEn.length > 80 || t.bodyEn.length > 280 || t.ctaEn.length > 30;
  const end = until ? new Date(until) : null;
  const ok = t.titleFr.trim() && !tooLong && (!end || (!isNaN(end.getTime()) && end.getTime() > Date.now()));

  const save = async () => {
    const who = aud === "staff" || !clientSends ? "l'équipe seulement" : audienceLabel(aud).toLowerCase();
    if (!confirm(`Mettre ce message en ligne pour ${who} ?`)) return;
    setBusy(true); setMsg(null);
    const e = await createMessage({ ...t, url: url === "none" ? null : url, audience: aud, endsAt: end, byName: user?.email ?? "équipe" });
    setBusy(false);
    if (e) setMsg(e); else onDone();
  };

  return (
    <SidePanel title="Nouveau message dans l'app" subtitle="En haut de l'accueil, jusqu'à ce que le client le ferme" onClose={onClose} width={620}
      footer={<div style={{ display: "flex", gap: 14, alignItems: "center", justifyContent: "flex-end" }}>
        {msg && <span style={{ flex: 1, fontSize: 13.5, color: C.coral }}>{msg}</span>}
        <button type="button" className="mk-link quiet" onClick={onClose}>Annuler</button>
        <Button variant="primary" disabled={!ok || busy} onClick={() => void save()}>Mettre en ligne</Button>
      </div>}>
      <style>{ST_CSS + MS_CSS + MK_CSS}</style>
      <div style={{ display: "grid", gap: 28 }}>
        <Line id="am-title" label="Titre" value={t.titleFr} onChange={(v) => setT({ ...t, titleFr: v })} max={80} big />
        <Line id="am-body" label="Texte" value={t.bodyFr} onChange={(v) => setT({ ...t, bodyFr: v })} max={280} optional />
        <div>
          <p className="ms-k" style={{ marginBottom: 8 }}>Lien</p>
          <Opts label="Lien" value={url} onPick={setUrl} options={[{ id: "none", label: "Aucun" }, ...APP_LINKS.map((l) => ({ id: l.id as string, label: l.label }))]} />
        </div>
        {url !== "none" && <Line id="am-cta" label="Texte du lien" value={t.ctaFr} onChange={(v) => setT({ ...t, ctaFr: v })} max={30} optional />}
        <AudiencePick value={aud} onPick={setAud} />
        <div>
          <p className="ms-k" style={{ marginBottom: 8 }}>Jusqu'à quand</p>
          <input type="datetime-local" value={until} onChange={(e) => setUntil(e.target.value)} aria-label="Date de fin"
            style={{ border: "none", borderBottom: `1px solid ${C.bds}`, background: "transparent", color: C.t1, font: "inherit", fontSize: 15, padding: "4px 0" }} />
          <p className="st-hint">{until ? "Le message disparaît tout seul à cette date." : "Vide : il reste en ligne jusqu'à ce qu'on le mette en pause."}</p>
        </div>
        <div style={{ display: "grid", gap: 20 }}>
          <p className="ms-k" style={{ margin: 0 }}>En anglais, pour l'app en anglais</p>
          <Line id="am-title-en" label="Title" value={t.titleEn} onChange={(v) => setT({ ...t, titleEn: v })} max={80} optional />
          <Line id="am-body-en" label="Text" value={t.bodyEn} onChange={(v) => setT({ ...t, bodyEn: v })} max={280} optional />
          {url !== "none" && <Line id="am-cta-en" label="Link text" value={t.ctaEn} onChange={(v) => setT({ ...t, ctaEn: v })} max={30} optional />}
          {!t.titleEn.trim() && <p className="st-hint" style={{ margin: 0 }}>Sans titre anglais, tout le monde voit la version française.</p>}
        </div>
        <div>
          <p className="ms-k" style={{ marginBottom: 10 }}>Aperçu</p>
          <p style={{ margin: 0, fontSize: 17, fontWeight: 600, color: t.titleFr ? C.t1 : C.t3 }}>{t.titleFr || "Le titre"}</p>
          {(t.bodyFr || !t.titleFr) && <p style={{ margin: "2px 0 0", fontSize: 15, lineHeight: 1.5, color: t.bodyFr ? C.t2 : C.t3 }}>{t.bodyFr || "Le texte du message."}</p>}
          {url !== "none" && <p style={{ margin: "8px 0 0", fontSize: 15, fontWeight: 500, color: C.t1, display: "inline-flex", alignItems: "center", gap: 4 }}>{t.ctaFr || "Voir"} <ArrowRight style={{ width: 14, height: 14 }} /></p>}
        </div>
        <Reach clientSends={clientSends} audience={aud} />
      </div>
    </SidePanel>
  );
}
