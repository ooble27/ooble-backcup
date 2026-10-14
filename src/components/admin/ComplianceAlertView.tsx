/**
 * Examen d'une alerte de conformité, en plein écran.
 * À gauche, ce qui s'est passé (montant, motif, échéance, commandes en cause) ; à droite, qui est
 * le client (identité, risque, historique, alertes passées, dernière note). Tout est posé sur le fond :
 * aucun cadre, aucune pastille, aucune ombre. La décision reste en bas.
 */
import { useEffect, useMemo, useState } from "react";
import { ChevronRight, FileText } from "lucide-react";
import { nfCad, nfUsdt, STATUS_META, type AdminOrder } from "@/lib/adminOrders";
import { KYC_LABEL } from "@/lib/adminClient";
import { loadClient, peekClient, type ClientBundle } from "@/lib/clientProfileCache";
import { loadNotes, peekNotes, type ClientNote } from "@/lib/clientNotes";
import { assessClient, RISK_LEVEL } from "@/lib/riskScore";
import {
  ALERT_GUIDE, ALERT_TYPE_META, ALERT_STATUS_META, CLASSIFICATION_REASONS, RECORD_RETENTION_YEARS, daysUntil,
  type ComplianceAlert,
} from "@/lib/compliance";
import { C, FONT } from "./adminTheme";
import { Button, TextArea, Workspace, WsPane } from "./ui";

const dayFmt = new Intl.DateTimeFormat("fr-CA", { day: "numeric", month: "short", year: "numeric" });
const day = (iso?: string | null) => (iso ? dayFmt.format(new Date(iso.length === 10 ? `${iso}T12:00:00` : iso)) : "");
const isOpen = (a: ComplianceAlert) => a.status === "nouveau" || a.status === "en_cours";
const KYC_COLOR: Record<string, string> = { approved: "var(--a-sage)", pending: "var(--a-sun)", rejected: "var(--a-coral)", not_started: "var(--a-t3)" };
const RISK_COLOR = { low: "var(--a-sage)", medium: "var(--a-sun)", high: "var(--a-coral)", critical: "var(--a-coral)" } as const;

const CSS = `
.ca-col > * { animation: ca-in .5s cubic-bezier(.22,1,.36,1) both; }
.ca-col > *:nth-child(2) { animation-delay: .04s } .ca-col > *:nth-child(3) { animation-delay: .08s }
.ca-col > *:nth-child(4) { animation-delay: .12s } .ca-col > *:nth-child(n+5) { animation-delay: .16s }
@keyframes ca-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
.ca-amount { margin: 8px 0 0; font-size: clamp(40px, 5vw, 64px); line-height: 1; font-weight: 600; letter-spacing: -0.05em; font-variant-numeric: tabular-nums; color: var(--a-t1); }
.ca-eyebrow { margin: 0; font-size: 12.5px; color: var(--a-t3); }
.ca-h { margin: 36px 0 10px; font-size: 12.5px; color: var(--a-t3); }
.ca-link { all: unset; box-sizing: border-box; cursor: pointer; width: 100%; display: flex; align-items: center; gap: 14px; padding: 10px 0; font-family: inherit; }
.ca-radio { all: unset; box-sizing: border-box; cursor: pointer; display: flex; gap: 12px; align-items: flex-start; padding: 7px 0; font-size: 13.5px; line-height: 1.45; color: var(--a-t2); font-family: inherit; }
.ca-radio[aria-checked="true"] { color: var(--a-t1); }
.ca-radio > span:first-child { width: 18px; height: 18px; border-radius: 99px; flex-shrink: 0; box-shadow: inset 0 0 0 1.5px var(--a-bd); transition: box-shadow .2s; }
.ca-radio[aria-checked="true"] > span:first-child { box-shadow: inset 0 0 0 6px var(--a-t1); }
.ca-radio:focus-visible, .ca-link:focus-visible { outline: 2px solid var(--a-accent); outline-offset: 2px; border-radius: 8px; }
@media (prefers-reduced-motion: reduce) { .ca-col > * { animation: none; } }
`;

export default function ComplianceAlertView({ alert, alerts, orders, busy, onClose, onTake, onClassify, onDeclare, onOpenAlert, onOpenOrder, onShowClient }: {
  alert: ComplianceAlert; alerts: ComplianceAlert[]; orders: AdminOrder[]; busy?: boolean;
  onClose: () => void; onTake: () => void;
  onClassify: (reason: string, notes: string) => void; onDeclare: () => void;
  onOpenAlert: (a: ComplianceAlert) => void;
  onOpenOrder?: (id: string) => void; onShowClient?: (id: string) => void;
}) {
  const open = isOpen(alert);
  const meta = ALERT_TYPE_META[alert.type];
  const [classifying, setClassifying] = useState(false);
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  useEffect(() => { setClassifying(false); setReason(""); setNotes(""); }, [alert.id]);

  // Le client : profil, commandes, notes de l'équipe (déjà en mémoire si la fiche a été ouverte).
  const uid = alert.userId ?? null;
  const [bundle, setBundle] = useState<ClientBundle | null>(() => (uid ? peekClient(uid) ?? null : null));
  const [notesList, setNotesList] = useState<ClientNote[] | null>(() => (uid ? peekNotes(uid) : null));
  useEffect(() => {
    if (!uid) return;
    let on = true;
    loadClient(uid).then((b) => { if (on) setBundle(b); }).catch(() => undefined);
    loadNotes(uid).then((n) => { if (on) setNotesList(n); }).catch(() => undefined);
    return () => { on = false; };
  }, [uid]);
  const profile = bundle?.profile ?? null;
  const risk = useMemo(() => (profile ? assessClient(profile) : null), [profile]);
  const done = (bundle?.orders ?? []).filter((o) => o.status === "completed");
  const exchanged = done.reduce((n, o) => n + o.cadAmount, 0);
  const lastNote = notesList?.[0];

  const involved = alert.orderIds.map((id, i) => ({ id, ref: alert.orderRefs[i] ?? "", order: orders.find((o) => o.id === id) }));
  const others = alerts.filter((a) => a.id !== alert.id && a.userId && a.userId === alert.userId).sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));

  const due = alert.dueDate ? daysUntil(alert.dueDate) : null;
  const dueColor = due === null ? C.t2 : due <= 1 ? C.coral : C.sun;

  return (
    <Workspace title={`Alerte ${alert.ref}`} subtitle={`${meta.full} · ${alert.clientName}`} onClose={onClose} panes>
      <style>{CSS}</style>
      <div className="ws-split">
        {/* Ce qui s'est passé */}
        <WsPane flat style={{ fontFamily: FONT }}>
          <div key={alert.id} className="ca-col" style={{ padding: "12px 20px 32px", maxWidth: 760 }}>
            <p className="ca-eyebrow"><span style={{ color: meta.critical ? C.coral : C.t2 }}>{meta.label}</span> · {ALERT_STATUS_META[alert.status].label}{alert.source === "manuel" ? " · signalée par l'équipe" : ""}</p>
            <p className="ca-amount">{nfCad.format(alert.amount)} $</p>
            <p style={{ margin: "16px 0 0", fontSize: 16, lineHeight: 1.6, color: C.t2, maxWidth: 620, textWrap: "pretty" } as React.CSSProperties}>{alert.reason}</p>
            <p style={{ margin: "14px 0 0", fontSize: 14, color: C.t3 }}>
              Opération du {day(alert.occurredAt)}
              {open && alert.dueDate && <> · <span style={{ color: dueColor }}>déclaration à soumettre {due! < 0 ? `depuis ${-due!} j (échéance dépassée)` : due === 0 ? "aujourd'hui" : `d'ici le ${day(alert.dueDate)}, dans ${due} j`}</span></>}
            </p>

            {/* La marche à suivre, en clair : on n'a pas besoin de connaître la loi pour traiter l'alerte. */}
            {open && (
              <>
                <p className="ca-h">Que faire</p>
                <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: C.t2, maxWidth: 620 }}>{ALERT_GUIDE[alert.type].why}</p>
                <ol style={{ margin: "14px 0 0", padding: 0, listStyle: "none", display: "grid", gap: 12, maxWidth: 620, counterReset: "step" }}>
                  {ALERT_GUIDE[alert.type].steps.map((st, i) => (
                    <li key={i} style={{ display: "flex", gap: 14, fontSize: 14, lineHeight: 1.55, color: C.t1 }}>
                      <span style={{ width: 18, flexShrink: 0, fontSize: 15, fontWeight: 600, color: C.t3, fontVariantNumeric: "tabular-nums" }}>{i + 1}</span>
                      <span>{st}</span>
                    </li>
                  ))}
                </ol>
              </>
            )}

            {involved.length > 0 && (
              <>
                <p className="ca-h">{involved.length > 1 ? `${involved.length} commandes en cause` : "Commande en cause"}</p>
                <div style={{ display: "grid" }}>
                  {involved.map(({ id, ref, order: o }) => (
                    <button key={id} type="button" className="ca-link ui-row" onClick={() => onOpenOrder?.(id)} disabled={!onOpenOrder || !o}>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: "block", fontSize: 14.5, color: C.t1 }}>
                          {o ? <>{o.type === "buy" ? "Achat" : "Vente"} de {nfCad.format(o.cad)} $ <span style={{ color: C.t3 }}>· {nfUsdt.format(o.usdt)} USDT{o.network ? ` ${o.network.toUpperCase()}` : ""}</span></> : ref}
                        </span>
                        <span style={{ display: "block", marginTop: 2, fontSize: 12.5, color: C.t3 }}>
                          {o ? <>{o.ref} · {STATUS_META[o.status].label.toLowerCase()}{o.interacEmail ? ` · Interac ${o.interacEmail}` : ""}</> : "Commande hors de la liste chargée"}
                        </span>
                      </span>
                      {o && onOpenOrder && <ChevronRight style={{ width: 16, height: 16, color: C.t3 }} />}
                    </button>
                  ))}
                </div>
              </>
            )}

            {!open && (
              <>
                <p className="ca-h">Décision</p>
                <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.6, color: C.t1 }}>
                  {alert.status === "declare" ? "Déclarée au CANAFE" : "Classée sans suite"}{alert.closedBy ? ` par ${alert.closedBy}` : ""}{alert.closedAt ? ` le ${day(alert.closedAt)}` : ""}.
                  {alert.classification && <span style={{ color: C.t2 }}> Motif : {alert.classification}.</span>}
                </p>
                {alert.notes && <p style={{ margin: "8px 0 0", fontSize: 14, lineHeight: 1.6, color: C.t2, whiteSpace: "pre-wrap" }}>« {alert.notes} »</p>}
              </>
            )}
          </div>
        </WsPane>

        {/* Qui est le client, et la décision */}
        <WsPane flat style={{ display: "flex", flexDirection: "column", fontFamily: FONT }}>
          <div key={alert.id} className="ca-col" style={{ flex: 1, padding: "12px 20px 20px 16px" }}>
            <p className="ca-eyebrow">Client</p>
            <button type="button" className="ca-link ui-row" style={{ padding: "4px 0" }} onClick={() => uid && onShowClient?.(uid)} disabled={!uid || !onShowClient}>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 26, fontWeight: 600, letterSpacing: "-0.04em", lineHeight: 1.15, color: C.t1, overflowWrap: "anywhere" }}>{alert.clientName}</span>
                <span style={{ display: "block", marginTop: 2, fontSize: 13, color: C.t3 }}>{alert.clientEmail}</span>
              </span>
              {uid && onShowClient && <ChevronRight style={{ width: 16, height: 16, color: C.t3 }} />}
            </button>

            {profile && (
              <p style={{ margin: "14px 0 0", fontSize: 14, lineHeight: 1.65, color: C.t2 }}>
                Identité <span style={{ color: KYC_COLOR[profile.kycStatus] }}>{KYC_LABEL[profile.kycStatus].toLowerCase()}</span>.{" "}
                {done.length === 0 ? "Aucune commande terminée." : <>{done.length} commande{done.length > 1 ? "s" : ""} terminée{done.length > 1 ? "s" : ""}, <b style={{ color: C.t1, fontWeight: 500 }}>{nfCad.format(exchanged)} $</b> échangés.</>}
                {" "}Client depuis le {day(profile.createdAt)}.
              </p>
            )}

            {risk && (
              <div style={{ marginTop: 24 }}>
                <p className="ca-eyebrow">Score de risque</p>
                <p style={{ margin: "6px 0 0", display: "flex", alignItems: "baseline", gap: 10 }}>
                  <span style={{ fontSize: 40, fontWeight: 600, letterSpacing: "-0.05em", lineHeight: 1, fontVariantNumeric: "tabular-nums", color: RISK_COLOR[risk.level] }}>{risk.score}</span>
                  <span style={{ fontSize: 14, color: C.t2 }}>{RISK_LEVEL[risk.level].fr.toLowerCase()}</span>
                </p>
                {risk.factors.filter((f) => f.delta > 0).slice(0, 3).map((f) => (
                  <p key={f.label} style={{ margin: "6px 0 0", fontSize: 13, color: C.t3 }}>{f.label} <span style={{ color: C.t2 }}>+{f.delta}</span></p>
                ))}
              </div>
            )}

            <div style={{ marginTop: 24 }}>
              <p className="ca-eyebrow">{others.length ? `${others.length + 1}e alerte pour ce client` : "Première alerte pour ce client"}</p>
              {others.slice(0, 4).map((a) => (
                <button key={a.id} type="button" className="ca-link ui-row" style={{ padding: "6px 0" }} onClick={() => onOpenAlert(a)}>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, color: C.t1 }}>
                    {ALERT_TYPE_META[a.type].label} · {nfCad.format(a.amount)} $ <span style={{ color: C.t3 }}>· {ALERT_STATUS_META[a.status].label.toLowerCase()} · {day(a.occurredAt)}</span>
                  </span>
                </button>
              ))}
            </div>

            {lastNote && (
              <div style={{ marginTop: 24 }}>
                <p className="ca-eyebrow">Dernière note de l'équipe · {lastNote.author}</p>
                <p style={{ margin: "6px 0 0", fontSize: 14, lineHeight: 1.55, color: C.t1, whiteSpace: "pre-wrap", display: "-webkit-box", WebkitLineClamp: 4, WebkitBoxOrient: "vertical", overflow: "hidden" }}>« {lastNote.body} »</p>
              </div>
            )}

            <p style={{ margin: "24px 0 0", fontSize: 13.5, color: C.t2 }}>
              {alert.assignedTo ? <>Suivie par <b style={{ color: C.t1, fontWeight: 500 }}>{alert.mine ? "vous" : alert.assignedTo}</b>.</> : open ? "Personne ne suit encore cette alerte." : null}
              {open && !alert.mine && (
                <button type="button" onClick={onTake} disabled={busy}
                  style={{ all: "unset", cursor: "pointer", marginLeft: 8, color: C.t1, textDecoration: "underline", textUnderlineOffset: 3 }}>
                  {alert.assignedTo ? "La reprendre" : "La prendre en charge"}
                </button>
              )}
            </p>

            {open && classifying && (
              <div style={{ marginTop: 28 }}>
                <p className="ca-eyebrow">Motif du classement</p>
                <div role="radiogroup" style={{ display: "grid", marginTop: 6 }}>
                  {CLASSIFICATION_REASONS.map((r) => (
                    <button key={r} type="button" role="radio" aria-checked={reason === r} className="ca-radio" onClick={() => setReason(r)}>
                      <span /><span>{r}</span>
                    </button>
                  ))}
                </div>
                <div style={{ marginTop: 12 }}>
                  <TextArea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} autoFocus placeholder="Pourquoi cette alerte ne demande pas de déclaration…" />
                </div>
                <p style={{ margin: "8px 0 0", fontSize: 12.5, color: C.t3 }}>Le motif et vos notes restent au dossier {RECORD_RETENTION_YEARS} ans.</p>
              </div>
            )}
          </div>

          {open && (
            <div className="ws-foot">
              {classifying ? (
                <div style={{ display: "flex", gap: 8 }}>
                  <Button variant="ghost" disabled={busy} onClick={() => setClassifying(false)}>Annuler</Button>
                  <Button variant="primary" className="flex-1" disabled={busy || !reason || !notes.trim()} onClick={() => onClassify(reason, notes)}>Confirmer le classement</Button>
                </div>
              ) : (
                <div style={{ display: "flex", gap: 8 }}>
                  <Button disabled={busy} onClick={() => setClassifying(true)}>Classer sans suite</Button>
                  <Button variant="primary" className="flex-1" disabled={busy} onClick={onDeclare} icon={<FileText style={{ width: 14, height: 14 }} />}>Déclarer</Button>
                </div>
              )}
              {!uid && <p style={{ margin: "10px 0 0", fontSize: 12.5, color: C.sun }}>Cette alerte n'est rattachée à aucun compte client.</p>}
            </div>
          )}
        </WsPane>
      </div>
    </Workspace>
  );
}
