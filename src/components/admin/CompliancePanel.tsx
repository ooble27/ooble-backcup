import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchCached, peek, put } from "@/lib/adminCache";
import { Check, Clock, Download, FileText, Flag, RefreshCw, Shield } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { nfCad, type AdminOrder } from "@/lib/adminOrders";
import {
  ALERT_TYPE_META, ALERT_STATUS_META,
  DECL_TYPE_META, DECL_STATUS_META,
  RECORD_CATEGORIES, CHECKLIST_CATEGORIES,
  DOIMV_THRESHOLD, DOIMV_DEADLINE_BUSINESS_DAYS, RECORD_RETENTION_YEARS,
  addBusinessDays, daysUntil, declarationDeadlineText,
  DOT_INDICATORS, ID_TYPES, PROVINCES,
  initialDeclarationForm,
  type ComplianceAlert, type AlertType, type AlertStatus,
  type ComplianceDeclaration, type DeclarationType, type DeclarationStatus,
  type ChecklistItem, type DeclarationFormData, type RecordCategoryId,
} from "@/lib/compliance";
import {
  fetchAlerts, fetchDeclarations, fetchChecklist, fetchRegisterStats,
  runScan, takeAlert, classifyAlert, markAlertDeclared, createManualAlert, findClientByEmail,
  saveDeclaration, updateDeclarationStatus, setChecklistItem, downloadRegister, fetchSanctionStatus,
  type RegisterStats, type SanctionListStatus,
} from "@/lib/complianceLive";
import { logAdminAction } from "@/lib/audit";
import { fetchKycIdentity } from "@/lib/adminKyc";
import { C, FONT } from "./adminTheme";
import { Button, Field, Group, Notice, SidePanel, TextArea, TextInput, Workspace, fieldInput } from "./ui";
import { ComplianceHero } from "./heroes";
import ComplianceAlertView from "./ComplianceAlertView";
import {
  DataTable, EmptyState, FilterChips, KeyValues, Pill, Section, Tabs, Toolbar, TwoLine,
  type Column, type Tone,
} from "./layout";

/*
 * Conformité CANAFE : alertes (analyse automatique toutes les 10 minutes et
 * signalements de l'équipe), déclarations (DOIMV, DOT, DBT), registre exportable
 * et programme de conformité. Rien ne se supprime : tout est conservé
 * RECORD_RETENTION_YEARS ans.
 */

// ──────────────── Libellés et tons ────────────────

const ALERT_TONE: Record<AlertStatus, Tone> = { nouveau: "warn", en_cours: "info", declare: "neutral", classe: "neutral" };
const DECL_TONE: Record<DeclarationStatus, Tone> = { brouillon: "warn", soumise: "info", acceptee: "ok", rejetee: "danger" };

/** Type d'alerte ou de déclaration, en texte : corail quand il signale un soupçon. */
const TypePill = ({ type }: { type: AlertType | DeclarationType }) => {
  const meta = (ALERT_TYPE_META as Record<string, { label: string; critical: boolean }>)[type]
    ?? { label: (DECL_TYPE_META as Record<string, { label: string }>)[type]?.label ?? type, critical: type === "dot" || type === "dbt" };
  return <span style={{ fontSize: 13, color: meta.critical ? C.coral : C.t2, whiteSpace: "nowrap" }}>{meta.label}</span>;
};

/** Échéance d'une déclaration, en clair. */
const dueText = (type: DeclarationType, dueDate?: string) => {
  if (type === "dot") return "Dès que possible";
  if (type === "dbt") return "Immédiatement";
  if (!dueDate) return "5 jours ouvrables";
  const d = daysUntil(dueDate);
  return `${dueDate} (${d > 0 ? `${d} j` : d === 0 ? "aujourd'hui" : "dépassée"})`;
};

const alertDue = (a: ComplianceAlert) => {
  if (!a.dueDate) return null;
  const d = daysUntil(a.dueDate);
  return { text: `${a.dueDate} · ${d > 0 ? `${d} j` : d === 0 ? "aujourd'hui" : "dépassée"}`, urgent: d <= 1 };
};

const isOpen = (a: ComplianceAlert) => a.status === "nouveau" || a.status === "en_cours";

// ──────────────── Briques de formulaire à plat ────────────────

const selectStyle: React.CSSProperties = { ...fieldInput, appearance: "auto" };

/** Liste de choix unique : lignes séparées par des filets, pastille radio à droite. */
function RadioList<T extends string>({ options, value, onChange }: { options: { id: T; label: React.ReactNode; hint?: React.ReactNode }[]; value: T | ""; onChange: (v: T) => void }) {
  return (
    <div role="radiogroup" style={{ borderTop: `1px solid ${C.bds}` }}>
      {options.map((o) => {
        const on = value === o.id;
        return (
          <button key={o.id} type="button" role="radio" aria-checked={on} className="ui-row" onClick={() => onChange(o.id)}
            style={{ all: "unset", boxSizing: "border-box", width: "100%", display: "flex", alignItems: "flex-start", gap: 12, padding: "11px 4px", borderBottom: `1px solid ${C.bds}`, cursor: "pointer", fontFamily: FONT }}>
            <span aria-hidden style={{ width: 16, height: 16, marginTop: 2, borderRadius: 99, flexShrink: 0, boxSizing: "border-box", border: on ? `5px solid ${C.t1}` : `1.5px solid ${C.bd}` }} />
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: "block", fontSize: 13.5, lineHeight: 1.45, color: C.t1 }}>{o.label}</span>
              {o.hint && <span style={{ display: "block", marginTop: 2, fontSize: 12.5, color: C.t3, lineHeight: 1.5 }}>{o.hint}</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Liste de cases à cocher, même rythme que RadioList. */
function CheckList({ options, values, onToggle }: { options: readonly string[]; values: string[]; onToggle: (v: string) => void }) {
  return (
    <div style={{ borderTop: `1px solid ${C.bds}` }}>
      {options.map((o) => {
        const on = values.includes(o);
        return (
          <button key={o} type="button" role="checkbox" aria-checked={on} className="ui-row" onClick={() => onToggle(o)}
            style={{ all: "unset", boxSizing: "border-box", width: "100%", display: "flex", alignItems: "flex-start", gap: 12, padding: "11px 4px", borderBottom: `1px solid ${C.bds}`, cursor: "pointer", fontFamily: FONT }}>
            <span aria-hidden style={{
              width: 16, height: 16, marginTop: 2, borderRadius: 4, flexShrink: 0, boxSizing: "border-box", display: "inline-flex", alignItems: "center", justifyContent: "center",
              background: on ? C.t1 : "transparent", border: on ? "none" : `1.5px solid ${C.bd}`, color: C.bg,
            }}>{on && <Check style={{ width: 11, height: 11 }} strokeWidth={3} />}</span>
            <span style={{ fontSize: 13.5, lineHeight: 1.45, color: C.t1 }}>{o}</span>
          </button>
        );
      })}
    </div>
  );
}

const two: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 };
const three: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 14 };
const req = (label: string) => `${label} *`;

// ──────────────── Classer sans suite ────────────────

// ──────────────── Déclaration (plein écran, 4 étapes) ────────────────

const DECL_STEPS = [
  { id: "0", label: "Opération" },
  { id: "1", label: "Client" },
  { id: "2", label: "Justification" },
  { id: "3", label: "Récapitulatif" },
];

function DeclarationWorkspace({ sourceRef, dueDate, form, onChange, onSubmit, onClose, busy }: {
  sourceRef: string; dueDate?: string; form: DeclarationFormData; onChange: (f: DeclarationFormData) => void;
  onSubmit: (asBrouillon: boolean, canafeRef: string) => void; onClose: () => void; busy?: boolean;
}) {
  const [step, setStep] = useState(0);
  const [canafeRef, setCanafeRef] = useState("");
  const set = <K extends keyof DeclarationFormData>(k: K, v: DeclarationFormData[K]) => onChange({ ...form, [k]: v });

  const canAdvance = (s = step): boolean => {
    if (s === 0) return form.amountCad.length > 0 && form.operationDate.length > 0;
    if (s === 1) return form.clientName.length > 0 && form.clientEmail.length > 0
      && form.clientDob.length > 0 && form.clientIdType.length > 0 && form.clientIdNumber.length > 0
      && form.clientAddress.length > 0 && form.clientCity.length > 0 && form.clientProvince.length > 0
      && form.clientPostalCode.length > 0;
    if (s === 2 && form.type === "dot") return form.suspicionIndicators.length > 0 && form.observations.trim().length > 0;
    return true;
  };
  const reachable = (target: number) => target <= step || Array.from({ length: target }, (_, i) => i).every((i) => canAdvance(i));

  const toggleIndicator = (ind: string) => {
    const cur = form.suspicionIndicators;
    set("suspicionIndicators", cur.includes(ind) ? cur.filter((x) => x !== ind) : [...cur, ind]);
  };

  const input = (k: keyof DeclarationFormData, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <TextInput value={form[k] as string} onChange={(e) => set(k, e.target.value as never)} {...props} />
  );

  return (
    <Workspace
      title="Déclarer au CANAFE"
      subtitle={`${DECL_TYPE_META[form.type].full} · ${sourceRef}`}
      onClose={onClose}
      closeLabel="Fermer sans enregistrer"
      steps={DECL_STEPS}
      step={String(step)}
      onStep={(id) => { const n = Number(id); if (reachable(n)) setStep(n); }}
    >
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
        <div style={{ maxWidth: 760, margin: "0 auto", padding: "28px 24px 40px" }}>
          {step === 0 && (
            <>
              <Group first title="Type de déclaration" description={DECL_TYPE_META[form.type].full}>
                <FilterChips value={form.type} onChange={(t) => set("type", t)}
                  options={(["doimv", "dot", "dbt"] as DeclarationType[]).map((t) => ({ id: t, label: DECL_TYPE_META[t].label }))} />
              </Group>
              <Group title="Opération">
                <FilterChips value={form.operationType} onChange={(v) => set("operationType", v)}
                  options={[{ id: "buy", label: "Achat" }, { id: "sell", label: "Vente" }]} />
                <FilterChips value={form.asset ?? "USDT"} onChange={(v) => set("asset", v as "USDT" | "USDC")}
                  options={[{ id: "USDC", label: "USDC" }, { id: "USDT", label: "USDT" }]} />
                <div style={two}>
                  <Field label={req("Montant CAD")}>{input("amountCad", { inputMode: "decimal" })}</Field>
                  <Field label={`Montant en ${form.asset ?? "USDT"}`} right={<span style={{ color: C.t3 }}>Facultatif</span>}>{input("amountUsdt", { inputMode: "decimal", placeholder: "0" })}</Field>
                </div>
                <div style={two}>
                  <Field label={req("Date de l'opération")} right={<span style={{ color: C.t3 }}>AAAA-MM-JJ</span>}>{input("operationDate", { placeholder: "2026-08-01" })}</Field>
                  <Field label="Mode de paiement">{input("paymentMethod")}</Field>
                </div>
              </Group>
              <Group title="Blockchain">
                <div style={two}>
                  <Field label="Réseau">{input("network", { placeholder: "Tron, Polygon…" })}</Field>
                  <Field label="Adresse du portefeuille">{input("walletAddress", { placeholder: "T…", style: { fontFamily: "ui-monospace, Menlo, monospace", fontSize: 13 } })}</Field>
                </div>
              </Group>
            </>
          )}

          {step === 1 && (
            <>
              <Group first title="Identité" description="Reprenez ces renseignements du dossier de vérification d'identité du client.">
                <div style={two}>
                  <Field label={req("Nom complet")}>{input("clientName")}</Field>
                  <Field label={req("Courriel")}>{input("clientEmail", { type: "email" })}</Field>
                </div>
                <div style={two}>
                  <Field label={req("Date de naissance")} right={<span style={{ color: C.t3 }}>AAAA-MM-JJ</span>}>{input("clientDob", { placeholder: "1990-01-15" })}</Field>
                  <Field label="Occupation">{input("clientOccupation", { placeholder: "Analyste, étudiant…" })}</Field>
                </div>
              </Group>
              <Group title="Pièce d'identité">
                <div style={two}>
                  <Field label={req("Type de pièce")}>
                    <select className="ui-input" style={selectStyle} value={form.clientIdType} onChange={(e) => set("clientIdType", e.target.value)}>
                      <option value="">Choisir…</option>
                      {ID_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </Field>
                  <Field label={req("Numéro")}>{input("clientIdNumber", { placeholder: "P1234567" })}</Field>
                </div>
              </Group>
              <Group title="Adresse">
                <Field label={req("Adresse")}>{input("clientAddress", { placeholder: "123 rue Principale" })}</Field>
                <div style={three}>
                  <Field label={req("Ville")}>{input("clientCity")}</Field>
                  <Field label={req("Province")}>
                    <select className="ui-input" style={selectStyle} value={form.clientProvince} onChange={(e) => set("clientProvince", e.target.value)}>
                      <option value="">Choisir…</option>
                      {PROVINCES.map((p) => <option key={p.code} value={p.code}>{p.code}</option>)}
                    </select>
                  </Field>
                  <Field label={req("Code postal")}>{input("clientPostalCode", { placeholder: "H2X 1Y1", style: { textTransform: "uppercase" } })}</Field>
                </div>
              </Group>
            </>
          )}

          {step === 2 && (
            <>
              {form.type === "doimv" && (
                <Group first title="Seuil DOIMV atteint">
                  <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.65, color: C.t2 }}>
                    La réception de {nfCad.format(Number(form.amountCad))} $ CA en monnaie virtuelle atteint le seuil de {nfCad.format(DOIMV_THRESHOLD)} $.
                    La DOIMV doit être soumise dans les {DOIMV_DEADLINE_BUSINESS_DAYS} jours ouvrables suivant la réception
                    {dueDate ? <>, au plus tard le <strong style={{ color: C.t1, fontWeight: 500 }}>{dueDate}</strong></> : null}.
                  </p>
                  <Field label="Observations" right={<span style={{ color: C.t3 }}>Facultatif</span>}>
                    <TextArea value={form.observations} onChange={(e) => set("observations", e.target.value)} rows={3} placeholder="Notes complémentaires…" />
                  </Field>
                </Group>
              )}
              {form.type === "dot" && (
                <>
                  <Notice tone="err">
                    À soumettre dès que possible une fois établis des motifs raisonnables de soupçonner. S'il s'agit de biens terroristes,
                    faites plutôt une DBT, immédiatement. Ne dites jamais au client qu'une déclaration est faite ou envisagée.
                  </Notice>
                  <Group title={req("Indicateurs de soupçon")} description="Cochez au moins un indicateur observé.">
                    <CheckList options={DOT_INDICATORS} values={form.suspicionIndicators} onToggle={toggleIndicator} />
                  </Group>
                  <Group title={req("Observations détaillées")}>
                    <TextArea value={form.observations} onChange={(e) => set("observations", e.target.value)} rows={5} placeholder="Dates, montants, comportements observés…" />
                  </Group>
                </>
              )}
              {form.type === "dbt" && (
                <>
                  <Notice tone="err">
                    Déclaration de biens terroristes : à soumettre immédiatement. Ne traitez pas l'opération, bloquez les fonds
                    et transmettez aussi les renseignements à la GRC et au SCRS.
                  </Notice>
                  <Group title={req("Observations détaillées")}>
                    <TextArea value={form.observations} onChange={(e) => set("observations", e.target.value)} rows={5} placeholder="Motifs de la déclaration…" />
                  </Group>
                </>
              )}
            </>
          )}

          {step === 3 && (
            <>
              <Group first title="Opération">
                <KeyValues items={[
                  ["Type", <TypePill key="t" type={form.type} />],
                  ["Opération", form.operationType === "buy" ? "Achat" : "Vente"],
                  ["Montant", `${nfCad.format(Number(form.amountCad))} $`],
                  ...(form.amountUsdt ? [[form.asset ?? "USDT", form.amountUsdt] as [string, string]] : []),
                  ["Date", form.operationDate],
                  ["Paiement", form.paymentMethod || "N/D"],
                  ...(form.network ? [["Réseau", form.network] as [string, string]] : []),
                  ...(form.walletAddress ? [["Portefeuille", <span key="w" style={{ fontFamily: "ui-monospace, Menlo, monospace", fontSize: 12.5 }}>{form.walletAddress}</span>] as [string, React.ReactNode]] : []),
                ]} />
              </Group>
              <Group title="Client">
                <KeyValues items={[
                  ["Nom", form.clientName],
                  ["Courriel", form.clientEmail],
                  ["Naissance", form.clientDob],
                  ...(form.clientOccupation ? [["Occupation", form.clientOccupation] as [string, string]] : []),
                  ["Pièce d'identité", `${form.clientIdType} · ${form.clientIdNumber}`],
                  ["Adresse", `${form.clientAddress}, ${form.clientCity}, ${form.clientProvince} ${form.clientPostalCode}`],
                ]} />
              </Group>
              {form.type === "dot" && form.suspicionIndicators.length > 0 && (
                <Group title={`Indicateurs de soupçon · ${form.suspicionIndicators.length}`}>
                  <ul style={{ margin: 0, paddingLeft: 18, listStyle: "disc", display: "grid", gap: 4, fontSize: 13.5, color: C.t1 }}>
                    {form.suspicionIndicators.map((ind) => <li key={ind}>{ind}</li>)}
                  </ul>
                </Group>
              )}
              {form.observations && (
                <Group title="Observations">
                  <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.65, whiteSpace: "pre-wrap", color: C.t1 }}>{form.observations}</p>
                </Group>
              )}
              <Group title="Soumission">
                <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: C.t2 }}>
                  Échéance : <strong style={{ color: C.t1, fontWeight: 500 }}>{dueText(form.type, form.type === "doimv" ? dueDate : undefined)}</strong> ({declarationDeadlineText(form.type)}).
                  Soumettez la déclaration sur le portail du CANAFE, puis notez ici le numéro qu'il vous donne.
                </p>
                <Field label="Référence CANAFE" right={<span style={{ color: C.t3 }}>Après soumission sur le portail</span>}>
                  <TextInput value={canafeRef} onChange={(e) => setCanafeRef(e.target.value)} placeholder="Numéro donné par le CANAFE" style={{ fontFamily: "ui-monospace, Menlo, monospace", fontSize: 13 }} />
                </Field>
              </Group>
            </>
          )}
        </div>
      </div>

      <div style={{ flexShrink: 0, margin: "0 8px 8px", borderRadius: 12, background: C.l2, padding: "10px 12px 10px 16px", display: "flex", gap: 8, alignItems: "center", justifyContent: "flex-end", flexWrap: "wrap" }}>
        <span style={{ flex: 1, minWidth: 160, fontSize: 12.5, color: C.t3 }}>Étape {step + 1} sur 4 · les champs marqués * sont requis</span>
        <Button variant="ghost" onClick={step > 0 ? () => setStep(step - 1) : onClose}>{step > 0 ? "Précédent" : "Annuler"}</Button>
        {step < 3 ? (
          <Button variant="primary" disabled={!canAdvance()} onClick={() => setStep(step + 1)}>Continuer</Button>
        ) : (
          <>
            <Button disabled={busy} onClick={() => onSubmit(true, canafeRef)}>Enregistrer le brouillon</Button>
            <Button variant="primary" disabled={busy} onClick={() => onSubmit(false, canafeRef)}>Soumise au CANAFE</Button>
          </>
        )}
      </div>
    </Workspace>
  );
}

// ──────────────── Détail d'une déclaration ────────────────

/** Les informations de la déclaration, dans l'ordre où le portail du CANAFE les demande. */
function portalFields(d: ComplianceDeclaration, f: DeclarationFormData): { label: string; value: string; required: boolean; mono?: boolean }[] {
  const doimv = d.type === "doimv";
  return [
    { label: "Nom complet du client", value: f.clientName, required: true },
    { label: "Date de naissance", value: f.clientDob, required: doimv },
    { label: "Adresse", value: f.clientAddress, required: doimv },
    { label: "Ville", value: f.clientCity, required: doimv },
    { label: "Province", value: f.clientProvince, required: doimv },
    { label: "Code postal", value: f.clientPostalCode, required: doimv },
    { label: "Profession ou activité", value: f.clientOccupation, required: doimv },
    { label: "Type de pièce d'identité", value: f.clientIdType, required: doimv },
    { label: "Numéro de la pièce", value: f.clientIdNumber, required: doimv, mono: true },
    { label: "Courriel", value: f.clientEmail, required: false },
    { label: "Date de l'opération", value: f.operationDate, required: true },
    { label: "Type d'opération", value: f.operationType === "sell" ? `Réception de monnaie virtuelle (le client vend des ${f.asset ?? "USDT"})` : `Envoi de monnaie virtuelle (le client achète des ${f.asset ?? "USDT"})`, required: true },
    { label: "Montant en dollars canadiens", value: f.amountCad, required: true, mono: true },
    { label: "Monnaie virtuelle", value: f.asset === "USDC" ? "USDC (USD Coin, émis par Circle)" : "USDT (Tether)", required: doimv },
    { label: "Montant en monnaie virtuelle", value: f.amountUsdt, required: doimv, mono: true },
    { label: "Réseau", value: f.network, required: doimv },
    { label: "Adresse de portefeuille", value: f.walletAddress, required: doimv, mono: true },
    { label: "Mode de paiement", value: f.paymentMethod, required: false },
    ...(d.type !== "doimv" ? [
      { label: "Indicateurs de soupçon", value: f.suspicionIndicators.join(" ; "), required: d.type === "dot" },
      { label: "Description (pourquoi vous soupçonnez)", value: f.observations, required: true },
    ] : [{ label: "Observations", value: f.observations, required: false }]),
  ].filter((x) => x.required || x.value);
}

function CopyRow({ label, value, required, mono }: { label: string; value: string; required: boolean; mono?: boolean }) {
  const [copied, setCopied] = useState(false);
  const missing = required && !value.trim();
  const copy = () => {
    void navigator.clipboard?.writeText(value).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1500); });
  };
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 12, padding: "8px 0" }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: 12, color: C.t3 }}>{label}</p>
        <p style={{ margin: "2px 0 0", lineHeight: 1.45, color: missing ? C.coral : C.t1, overflowWrap: "anywhere", whiteSpace: "pre-wrap",
          fontFamily: mono && !missing ? "ui-monospace, Menlo, monospace" : FONT, fontSize: mono && !missing ? 13 : 14 }}>
          {missing ? "À compléter" : value}
        </p>
      </div>
      {!missing && (
        <button type="button" onClick={copy} style={{ all: "unset", cursor: "pointer", fontSize: 12.5, color: copied ? C.sage : C.t2, textDecoration: copied ? "none" : "underline", textUnderlineOffset: 3, flexShrink: 0 }}>
          {copied ? "Copié" : "Copier"}
        </button>
      )}
    </div>
  );
}

function DeclarationPanel({ decl, onClose, onResume, onStatus, busy }: {
  decl: ComplianceDeclaration; onClose: () => void; onResume: () => void;
  onStatus: (status: DeclarationStatus, canafeRef?: string) => void; busy?: boolean;
}) {
  const [ref, setRef] = useState(decl.canafRef ?? "");
  const days = decl.dueDate ? daysUntil(decl.dueDate) : null;
  const urgent = decl.status === "brouillon" && (decl.type !== "doimv" || (days !== null && days <= 2));
  const f = decl.formData;

  return (
    <SidePanel title={`Déclaration ${decl.ref}`} subtitle={DECL_TYPE_META[decl.type].full} onClose={onClose} width={580}>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <TypePill type={decl.type} />
        <Pill tone={DECL_TONE[decl.status]}>{DECL_STATUS_META[decl.status].label}</Pill>
      </div>
      <KeyValues items={[
        ["Client", decl.clientName],
        ["Montant", `${nfCad.format(decl.amount)} $`],
        ["Créée le", decl.createdAt],
        ["Échéance", <span key="e" style={{ color: urgent ? C.dangerText : undefined }}>{decl.status === "brouillon" ? dueText(decl.type, decl.dueDate) : decl.dueDate ?? declarationDeadlineText(decl.type)}</span>],
        ...(decl.submittedAt ? [["Soumise le", decl.submittedAt] as [string, string]] : []),
        ...(decl.canafRef ? [["Réf. CANAFE", <span key="r" style={{ fontFamily: "ui-monospace, Menlo, monospace", fontSize: 12.5 }}>{decl.canafRef}</span>] as [string, React.ReactNode]] : []),
        ...(decl.alertRef ? [["Alerte source", decl.alertRef] as [string, string]] : []),
      ]} />

      {decl.status !== "acceptee" && (
        <Section title="Suivi" style={{ marginTop: 28 }}>
          <div style={{ display: "grid", gap: 14 }}>
            {decl.status === "brouillon" && (
              <div><Button size="sm" disabled={busy} onClick={onResume} icon={<FileText style={{ width: 14, height: 14 }} />}>Reprendre le brouillon</Button></div>
            )}
            <Field label="Référence CANAFE" hint="Donnée par le portail après la soumission.">
              <TextInput value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Numéro de référence" style={{ fontFamily: "ui-monospace, Menlo, monospace", fontSize: 13 }} />
            </Field>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {decl.status === "brouillon" && <Button size="sm" variant="primary" disabled={busy} onClick={() => onStatus("soumise", ref)}>Marquer soumise au CANAFE</Button>}
              {decl.status !== "brouillon" && ref !== (decl.canafRef ?? "") && <Button size="sm" disabled={busy} onClick={() => onStatus(decl.status, ref)}>Enregistrer la référence</Button>}
              {(decl.status === "soumise" || decl.status === "rejetee") && <Button size="sm" variant="primary" disabled={busy} onClick={() => onStatus("acceptee", ref)}>Acceptée par le CANAFE</Button>}
              {decl.status === "soumise" && <Button size="sm" variant="ghost" disabled={busy} onClick={() => onStatus("rejetee", ref)}>Rejetée</Button>}
            </div>
          </div>
        </Section>
      )}

      {f && (() => {
        const fields = portalFields(decl, f);
        const missing = fields.filter((x) => x.required && !x.value.trim()).length;
        return (
          <Section title="Pour le portail du CANAFE" style={{ marginTop: 28 }}>
            {decl.status === "brouillon" && (
              <ol style={{ margin: "0 0 14px", padding: 0, listStyle: "none", display: "grid", gap: 8, fontSize: 13.5, lineHeight: 1.55, color: C.t2 }}>
                {[
                  "Connectez-vous au portail de déclaration du CANAFE (FWR).",
                  `Créez une nouvelle déclaration : ${DECL_TYPE_META[decl.type].full}.`,
                  "Copiez chaque information ci-dessous dans le champ du même nom.",
                  "Soumettez, puis saisissez plus haut le numéro de confirmation donné par le portail.",
                ].map((t, i) => (
                  <li key={i} style={{ display: "flex", gap: 12 }}><span style={{ width: 14, flexShrink: 0, fontWeight: 600, color: C.t3 }}>{i + 1}</span><span>{t}</span></li>
                ))}
              </ol>
            )}
            {missing > 0 && (
              <p style={{ margin: "0 0 10px", fontSize: 13.5, color: C.coral }}>
                {missing} information{missing > 1 ? "s manquent" : " manque"}. Reprenez le brouillon pour {missing > 1 ? "les" : "la"} compléter avant de soumettre.
              </p>
            )}
            <div style={{ display: "grid" }}>
              {fields.map((x) => <CopyRow key={x.label} {...x} />)}
            </div>
          </Section>
        );
      })()}
      <p style={{ margin: "28px 0 0", fontSize: 12, color: C.t3 }}>Conservée {RECORD_RETENTION_YEARS} ans (LRPCFAT). Une déclaration ne peut pas être supprimée.</p>
    </SidePanel>
  );
}

// ──────────────── Signaler un client ────────────────

const MANUAL_TYPES: AlertType[] = ["dot", "ppv", "sanctions", "voyage", "doimv"];

function SignalerPanel({ orders, onSubmit, onClose, busy }: {
  orders: AdminOrder[];
  onSubmit: (input: { type: AlertType; email: string; orderRef: string; amount: number; reason: string }) => void;
  onClose: () => void; busy?: boolean;
}) {
  const [type, setType] = useState<AlertType>("dot");
  const [email, setEmail] = useState("");
  const [orderRef, setOrderRef] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");

  // Commande saisie : client et montant remplis d'office.
  const order = useMemo(() => {
    const r = orderRef.trim().toUpperCase();
    return r ? orders.find((o) => o.ref === r) : undefined;
  }, [orderRef, orders]);
  useEffect(() => {
    if (!order) return;
    setEmail(order.clientEmail);
    setAmount(String(order.cad));
  }, [order]);

  const valid = email.trim().includes("@") && reason.trim().length > 10;

  return (
    <SidePanel title="Signaler un client" subtitle="Ouvrir une alerte à partir d'une observation de l'équipe" onClose={onClose} width={580}
      footer={<>
        <Button variant="ghost" onClick={onClose}>Annuler</Button>
        <Button variant="primary" disabled={!valid || busy} icon={<Flag style={{ width: 14, height: 14 }} />}
          onClick={() => onSubmit({ type, email, orderRef: order?.ref ?? "", amount: Number(amount.replace(/\s/g, "").replace(",", ".")) || 0, reason })}>
          Ouvrir l'alerte
        </Button>
      </>}>
      <p style={{ margin: "0 0 6px", fontSize: 12.5, color: C.t3 }}>Type d'alerte</p>
      <RadioList options={MANUAL_TYPES.map((t) => ({ id: t, label: ALERT_TYPE_META[t].label, hint: ALERT_TYPE_META[t].full }))} value={type} onChange={setType} />
      <div style={{ display: "grid", gap: 16, marginTop: 22 }}>
        <div style={two}>
          <Field label="Commande" right={<span style={{ color: C.t3 }}>Facultatif</span>}
            hint={orderRef.trim() && !order ? "Introuvable dans la liste chargée : l'alerte sera liée au client seulement." : undefined}>
            <TextInput value={orderRef} onChange={(e) => setOrderRef(e.target.value)} placeholder="OOB-XXXXXXXX" style={{ textTransform: "uppercase" }} />
          </Field>
          <Field label={req("Courriel du client")}>
            <TextInput type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="client@exemple.com" />
          </Field>
        </div>
        <Field label="Montant en cause (CAD)" right={<span style={{ color: C.t3 }}>Facultatif</span>}>
          <TextInput inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
        </Field>
        <Field label={req("Ce qui a été observé")}>
          <TextArea value={reason} onChange={(e) => setReason(e.target.value)} rows={5} placeholder="Faits, dates, montants, documents…" />
        </Field>
      </div>
    </SidePanel>
  );
}

// ──────────────── Détail d'une alerte ────────────────

// ──────────────── Onglet Alertes ────────────────

function AlertesView({ alerts, onOpen, onScan, onSignaler, busy, selectedId }: {
  alerts: ComplianceAlert[]; onOpen: (a: ComplianceAlert) => void; onScan: () => void; onSignaler: () => void; busy?: boolean; selectedId?: string | null;
}) {
  const [filter, setFilter] = useState<"actives" | "miennes" | "traitees">("actives");
  const actives = alerts.filter(isOpen);
  const miennes = actives.filter((a) => a.mine);
  const traitees = alerts.filter((a) => !isOpen(a));
  const list = filter === "actives" ? actives : filter === "miennes" ? miennes : traitees;

  const columns: Column<ComplianceAlert>[] = [
    { key: "client", header: "Client", sort: (a) => a.clientName, render: (a) => <TwoLine primary={a.clientName} secondary={`${a.ref}${a.source === "manuel" ? " · signalée par l'équipe" : ""}`} /> },
    { key: "type", header: "Type", render: (a) => <TypePill type={a.type} /> },
    { key: "reason", header: "Motif", hideBelow: 1180, render: (a) => <span style={{ color: C.t3, display: "block", maxWidth: 380, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.reason}</span> },
    { key: "amount", header: "Montant", align: "right", sort: (a) => a.amount, render: (a) => `${nfCad.format(a.amount)} $` },
    { key: "due", header: "Échéance", hideBelow: 900, sort: (a) => a.dueDate ?? "9999", render: (a) => {
      const d = isOpen(a) ? alertDue(a) : null;
      return d ? <span style={{ color: d.urgent ? C.dangerText : C.t2, whiteSpace: "nowrap" }}>{d.text}</span> : <span style={{ color: C.t3 }}>{a.closedAt ? `close le ${a.closedAt}` : ""}</span>;
    } },
    { key: "status", header: "Suivi", render: (a) => (isOpen(a) && a.assignedTo
      ? <span style={{ fontSize: 13, color: C.t2, whiteSpace: "nowrap" }}>{a.mine ? "Vous" : a.assignedTo.split(/[\s@]/)[0]}</span>
      : <Pill tone={ALERT_TONE[a.status]}>{ALERT_STATUS_META[a.status].label}</Pill>) },
  ];

  return (
    <>
      <Toolbar right={<>
        <Button size="sm" variant="ghost" disabled={busy} onClick={onScan} icon={<RefreshCw style={{ width: 14, height: 14, animation: busy ? "spin 1s linear infinite" : undefined }} />}>Analyser maintenant</Button>
        <Button size="sm" onClick={onSignaler} icon={<Flag style={{ width: 14, height: 14 }} />}>Signaler un client</Button>
      </>}>
        <FilterChips value={filter} onChange={setFilter} options={[
          { id: "actives", label: "Actives", count: actives.length, alert: true },
          { id: "miennes", label: "Les miennes", count: miennes.length },
          { id: "traitees", label: "Traitées", count: traitees.length },
        ]} />
      </Toolbar>
      <DataTable
        rows={list}
        columns={columns}
        rowKey={(a) => a.id}
        onRowClick={onOpen}
        selectedKey={selectedId}
        initialSort={{ key: "due", dir: "asc" }}
        empty={<EmptyState icon={Shield} title={filter === "actives" ? "Aucune alerte active" : "Aucune alerte traitée"}
          text={filter === "actives" ? "Les opérations sont analysées toutes les 10 minutes : seuil DOIMV, règle des 24 heures, montants juste sous le seuil, fractionnement et paiements de tiers." : undefined} />}
        mobile={(a) => (
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}><TwoLine primary={a.clientName} secondary={`${ALERT_TYPE_META[a.type].label} · ${nfCad.format(a.amount)} $`} /></div>
            <Pill tone={ALERT_TONE[a.status]}>{ALERT_STATUS_META[a.status].label}</Pill>
          </div>
        )}
      />
    </>
  );
}

// ──────────────── Onglet Déclarations ────────────────

function DeclarationsView({ declarations, onOpen, selectedId }: { declarations: ComplianceDeclaration[]; onOpen: (id: string) => void; selectedId?: string | null }) {
  const [filter, setFilter] = useState<"en_cours" | "terminees">("en_cours");
  const enCours = declarations.filter((d) => d.status === "brouillon" || d.status === "soumise");
  const terminees = declarations.filter((d) => d.status === "acceptee" || d.status === "rejetee");
  const list = filter === "en_cours" ? enCours : terminees;

  const columns: Column<ComplianceDeclaration>[] = [
    { key: "ref", header: "Déclaration", sort: (d) => d.ref, render: (d) => <TwoLine primary={d.ref} secondary={d.clientName} /> },
    { key: "type", header: "Type", render: (d) => <TypePill type={d.type} /> },
    { key: "amount", header: "Montant", align: "right", sort: (d) => d.amount, render: (d) => `${nfCad.format(d.amount)} $` },
    { key: "due", header: "Échéance", hideBelow: 900, render: (d) => {
      const days = d.dueDate ? daysUntil(d.dueDate) : null;
      const urgent = d.status === "brouillon" && (d.type !== "doimv" || (days !== null && days <= 2));
      return <span style={{ color: urgent ? C.dangerText : C.t2 }}>{d.status === "brouillon" ? dueText(d.type, d.dueDate) : d.submittedAt ? `Soumise le ${d.submittedAt}` : "N/D"}</span>;
    } },
    { key: "canafe", header: "Réf. CANAFE", hideBelow: 1100, render: (d) => <span style={{ color: C.t3, fontFamily: "ui-monospace, Menlo, monospace", fontSize: 12.5 }}>{d.canafRef ?? ""}</span> },
    { key: "status", header: "Statut", render: (d) => <Pill tone={DECL_TONE[d.status]}>{DECL_STATUS_META[d.status].label}</Pill> },
  ];

  return (
    <>
      <Toolbar>
        <FilterChips value={filter} onChange={setFilter} options={[
          { id: "en_cours", label: "En cours", count: enCours.length },
          { id: "terminees", label: "Terminées", count: terminees.length },
        ]} />
      </Toolbar>
      <DataTable
        rows={list}
        columns={columns}
        rowKey={(d) => d.id}
        onRowClick={(d) => onOpen(d.id)}
        selectedKey={selectedId}
        empty={<EmptyState icon={FileText} title="Aucune déclaration ici" />}
        mobile={(d) => (
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}><TwoLine primary={`${d.ref} · ${DECL_TYPE_META[d.type].label}`} secondary={`${d.clientName} · ${nfCad.format(d.amount)} $`} /></div>
            <Pill tone={DECL_TONE[d.status]}>{DECL_STATUS_META[d.status].label}</Pill>
          </div>
        )}
      />
      <p style={{ margin: "14px 0 0", fontSize: 12.5, color: C.t3 }}>
        DOIMV : {DOIMV_DEADLINE_BUSINESS_DAYS} jours ouvrables après la réception · DOT : dès que possible · DBT : immédiatement · Conservation : {RECORD_RETENTION_YEARS} ans.
      </p>
    </>
  );
}

// ──────────────── Onglet Registre ────────────────

type PeriodId = "tout" | "30j" | "annee" | "dates";
const PERIODS: { id: PeriodId; label: string }[] = [
  { id: "tout", label: "Tout" },
  { id: "30j", label: "30 derniers jours" },
  { id: "annee", label: "Cette année" },
  { id: "dates", label: "Dates…" },
];

const monthFr = (iso: string) => new Date(iso).toLocaleDateString("fr-CA", { month: "long", year: "numeric" });

function RegistreView({ stats, onExport, busyKind }: {
  stats: RegisterStats | null;
  onExport: (kind: RecordCategoryId, from?: string, to?: string, format?: "pdf" | "detail" | "csv") => void;
  busyKind: RecordCategoryId | null;
}) {
  const [period, setPeriod] = useState<PeriodId>("tout");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const range = (): [string | undefined, string | undefined] => {
    const today = new Date().toISOString().slice(0, 10);
    if (period === "30j") return [new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10), today];
    if (period === "annee") return [`${today.slice(0, 4)}-01-01`, today];
    if (period === "dates") return [from || undefined, to || undefined];
    return [undefined, undefined];
  };
  const count = (id: RecordCategoryId): string => {
    if (!stats) return "…";
    const n: Record<RecordCategoryId, number> = {
      operations: stats.operations, identites: stats.identites, interac: stats.interac,
      envois: stats.envois, declarations: stats.declarations, alertes: stats.alertes,
    };
    return n[id] == null ? "…" : String(n[id]);
  };
  const detail = (id: RecordCategoryId): string | null => {
    if (!stats) return null;
    if (id === "operations" && stats.operations_1000 != null) return `dont ${stats.operations_1000} de 1 000 $ et plus`;
    if (id === "identites" && stats.identites_ok != null) return `${stats.identites_ok} approuvées · ${stats.entreprises ?? 0} comptes entreprise`;
    return null;
  };
  const oldest = stats?.plus_ancien ?? null;
  const purge = oldest ? new Date(new Date(oldest).setFullYear(new Date(oldest).getFullYear() + RECORD_RETENTION_YEARS)).toISOString() : null;
  const dateInput: React.CSSProperties = { height: 34, padding: "0 10px", borderRadius: 9, border: `1px solid ${C.bds}`, background: "var(--a-inputBg)", color: C.t1, fontSize: 13 };

  return (
    <>
      {/* Le registre en une phrase : chiffres en couleur, pas de cases. */}
      <p style={{ margin: "22px 0 0", fontSize: "clamp(18px, 1.8vw, 22px)", lineHeight: 1.4, letterSpacing: "-0.02em", color: C.t2, maxWidth: 860 }}>
        <b style={{ color: C.coral, fontWeight: 600 }}>{stats?.operations ?? "…"}</b> opérations payées au registre et{" "}
        <b style={{ color: C.sun, fontWeight: 600 }}>{stats?.journal ?? "…"}</b> actions de l'équipe au journal, conservées{" "}
        <b style={{ color: C.t1, fontWeight: 600 }}>{RECORD_RETENTION_YEARS} ans</b> (LRPCFAT).{" "}
        <span style={{ color: C.t3 }}>{oldest ? `La plus ancienne date de ${monthFr(oldest)}${purge ? `, conservée jusqu'en ${monthFr(purge)}` : ""}.` : ""}</span>
      </p>

      <Toolbar style={{ marginTop: 24 }}>
        <span style={{ fontSize: 12.5, color: C.t3, marginRight: 4 }}>Période exportée</span>
        <FilterChips value={period} onChange={setPeriod} options={PERIODS} />
        {period === "dates" && (
          <span style={{ display: "inline-flex", gap: 8, alignItems: "center", fontSize: 12.5, color: C.t3 }}>
            <input type="date" aria-label="Du" value={from} onChange={(e) => setFrom(e.target.value)} className="ui-input" style={dateInput} />
            au
            <input type="date" aria-label="Au" value={to} onChange={(e) => setTo(e.target.value)} className="ui-input" style={dateInput} />
          </span>
        )}
      </Toolbar>

      <div style={{ borderTop: `1px solid ${C.bds}` }}>
        {RECORD_CATEGORIES.map((cat) => (
          <div key={cat.id} style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap", padding: "14px 4px", borderBottom: `1px solid ${C.bds}` }}>
            <div style={{ flex: "1 1 280px", minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 13.5, color: C.t1 }}>
                {cat.label} <span style={{ marginLeft: 6, color: C.t3, fontVariantNumeric: "tabular-nums" }}>{count(cat.id)}</span>
              </p>
              <p style={{ margin: "3px 0 0", fontSize: 12.5, lineHeight: 1.5, color: C.t3 }}>{cat.description}{detail(cat.id) ? ` · ${detail(cat.id)}` : ""}</p>
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <Button size="sm" disabled={busyKind !== null} onClick={() => { const [f, t] = range(); onExport(cat.id, f, t, "pdf"); }}
                icon={<Download style={{ width: 14, height: 14 }} />}>{busyKind === cat.id ? "Export…" : "Registre PDF"}</Button>
              <Button size="sm" variant="ghost" disabled={busyKind !== null} title="Une fiche complète par entrée, document à part"
                onClick={() => { const [f, t] = range(); onExport(cat.id, f, t, "detail"); }}>Détail des entrées</Button>
              <Button size="sm" variant="ghost" disabled={busyKind !== null} onClick={() => { const [f, t] = range(); onExport(cat.id, f, t, "csv"); }}>CSV</Button>
            </div>
          </div>
        ))}
      </div>
      <p style={{ margin: "14px 0 0", fontSize: 12.5, lineHeight: 1.6, color: C.t3, maxWidth: 760 }}>
        Les données restent en base {RECORD_RETENTION_YEARS} ans au minimum : une commande payée, une alerte ou une déclaration ne peut pas être supprimée.
        Les pièces d'identité restent chez le fournisseur de vérification.
      </p>
    </>
  );
}

// ──────────────── Onglet Programme ────────────────

function ProgrammeView({ checklist, onToggle, onEvidence, busy }: {
  checklist: ChecklistItem[]; onToggle: (id: string) => void; onEvidence: (id: string, evidence: string) => void; busy?: boolean;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const total = checklist.length;
  const done = checklist.filter((c) => c.done).length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 16, margin: "20px 0 4px" }}>
        <span style={{ fontSize: 13.5, color: C.t1, fontVariantNumeric: "tabular-nums" }}>{pct} %</span>
        <div style={{ flex: 1, height: 4, borderRadius: 99, background: C.hover3, overflow: "hidden", maxWidth: 520 }}>
          <div style={{ width: `${pct}%`, height: "100%", background: C.t1, transition: "width .3s" }} />
        </div>
        <span style={{ fontSize: 12.5, color: C.t3 }}>{done} sur {total} points</span>
      </div>

      {CHECKLIST_CATEGORIES.map((category) => {
        const items = checklist.filter((c) => c.category === category);
        if (!items.length) return null;
        return (
          <Section key={category} title={category} actions={<span style={{ fontSize: 12.5, color: C.t3 }}>{items.filter((i) => i.done).length} / {items.length}</span>} style={{ marginTop: 28 }}>
            <div style={{ borderTop: `1px solid ${C.bds}` }}>
              {items.map((item) => (
                <div key={item.id} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "14px 4px", borderBottom: `1px solid ${C.bds}` }}>
                  <button type="button" role="checkbox" aria-checked={item.done} aria-label={item.done ? "Décocher" : "Cocher"} disabled={busy} onClick={() => onToggle(item.id)} className="ui-btn"
                    style={{
                      width: 18, height: 18, marginTop: 1, borderRadius: 5, flexShrink: 0, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", padding: 0,
                      background: item.done ? C.t1 : "transparent", border: item.done ? "none" : `1.5px solid ${C.bd}`, color: C.bg,
                    }}>{item.done && <Check style={{ width: 12, height: 12 }} strokeWidth={3} />}</button>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 13.5, color: item.done ? C.t3 : C.t1 }}>{item.label}</p>
                    <p style={{ margin: "3px 0 0", fontSize: 12.5, lineHeight: 1.55, color: C.t3 }}>{item.description}</p>
                    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 14, marginTop: 6, fontSize: 12, color: C.t3 }}>
                      {item.frequency && <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><Clock style={{ width: 12, height: 12 }} /> {item.frequency}</span>}
                      {item.dueDate && <span style={{ color: !item.done && daysUntil(item.dueDate) <= 60 ? C.warnText : C.t3 }}>Échéance : {item.dueDate}</span>}
                      {item.done && item.doneAt && <span>Fait le {item.doneAt}</span>}
                      {editing !== item.id && (
                        <button type="button" onClick={() => { setEditing(item.id); setDraft(item.evidence ?? ""); }}
                          style={{ all: "unset", cursor: "pointer", color: C.t2, textDecoration: "underline", textUnderlineOffset: 3 }}>
                          {item.evidence ? "Modifier la preuve" : "Ajouter une preuve"}
                        </button>
                      )}
                    </div>
                    {item.evidence && editing !== item.id && (
                      <p style={{ margin: "8px 0 0", padding: "8px 10px", borderRadius: 8, background: C.hover2, fontSize: 12.5, lineHeight: 1.55, color: C.t2, whiteSpace: "pre-wrap" }}>{item.evidence}</p>
                    )}
                    {editing === item.id && (
                      <div style={{ display: "grid", gap: 8, marginTop: 10, maxWidth: 620 }}>
                        <TextArea value={draft} onChange={(e) => setDraft(e.target.value)} rows={2} placeholder="Document, date, lien vers le fichier…" autoFocus />
                        <div style={{ display: "flex", gap: 6 }}>
                          <Button size="sm" variant="primary" disabled={busy} onClick={() => { onEvidence(item.id, draft); setEditing(null); }}>Enregistrer</Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>Annuler</Button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Section>
        );
      })}
      <p style={{ margin: "18px 0 0", fontSize: 12.5, color: C.t3 }}>Examen indépendant requis au moins tous les deux ans (LRPCFAT / RRPCFAT).</p>
    </>
  );
}

// ──────────────── Onglet À faire ────────────────

interface Todo { key: string; date?: string; title: string; sub: string; who?: string; onClick: () => void }
const monthShort = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("fr-CA", { month: "short" }).replace(".", "");

/** Tout ce qui attend le responsable conformité, de l'échéance la plus proche à la plus lointaine. */
function buildTodos(alerts: ComplianceAlert[], declarations: ComplianceDeclaration[], checklist: ChecklistItem[],
  open: { alert: (a: ComplianceAlert) => void; decl: (id: string) => void; programme: () => void }): Todo[] {
  const todos: Todo[] = [
    ...alerts.filter(isOpen).map((a) => ({
      key: a.id, date: a.dueDate,
      title: `${ALERT_TYPE_META[a.type].label} · ${a.clientName}`,
      sub: `${nfCad.format(a.amount)} $ · ${a.dueDate ? "déclaration à soumettre" : "alerte à examiner"} · ${a.ref}`,
      who: a.assignedTo ? (a.mine ? "Vous" : a.assignedTo.split(/[\s@]/)[0]) : undefined,
      onClick: () => open.alert(a),
    })),
    ...declarations.filter((d) => d.status === "brouillon").map((d) => ({
      key: d.id, date: d.dueDate,
      title: `Brouillon ${DECL_TYPE_META[d.type].label} · ${d.clientName}`,
      sub: `${nfCad.format(d.amount)} $ · à soumettre au CANAFE · ${d.ref}`,
      onClick: () => open.decl(d.id),
    })),
    // Programme : seulement ce qui tombe dans les 4 prochains mois (ou en retard).
    ...checklist.filter((c) => !c.done && c.dueDate && daysUntil(c.dueDate) <= 120).map((c) => ({
      key: c.id, date: c.dueDate,
      title: c.label,
      sub: `Programme de conformité${c.frequency ? ` · ${c.frequency.toLowerCase()}` : ""}`,
      onClick: open.programme,
    })),
  ];
  return todos.sort((a, b) => (a.date ?? "9999").localeCompare(b.date ?? "9999"));
}

const SANCTION_SOURCE: Record<SanctionListStatus["source"], string> = { canada: "Canada", onu: "ONU", ofac_wallets: "adresses de portefeuille" };
const nf0 = new Intl.NumberFormat("fr-CA");

/** Ce que les contrôles automatiques vérifient, et quand les listes de sanctions ont été lues. */
function Watch({ lists }: { lists: SanctionListStatus[] | null }) {
  const failed = (lists ?? []).filter((l) => !l.ok);
  const last = (lists ?? []).map((l) => l.checkedAt).sort().pop();
  return (
    <p style={{ margin: "20px 0 0", fontSize: 13.5, lineHeight: 1.6, color: C.t2, maxWidth: 880 }}>
      Toutes les 10 minutes, Ooble vérifie les seuils du CANAFE, la règle des 24 heures, le fractionnement, les paiements de tiers, les comptes récents et les hausses brusques
      {lists?.length ? <>, et compare chaque client et chaque portefeuille aux listes de sanctions lues le <b style={{ color: C.t1, fontWeight: 500 }}>{new Date(last!).toLocaleDateString("fr-CA", { day: "numeric", month: "short" })}</b> ({lists.filter((l) => l.ok).map((l) => `${SANCTION_SOURCE[l.source]} ${nf0.format(l.entries)}`).join(", ")})</> : null}.
      {failed.length > 0 && <span style={{ color: C.coral }}> La liste {failed.map((l) => SANCTION_SOURCE[l.source]).join(", ")} n'a pas pu être téléchargée : la version précédente reste utilisée.</span>}
    </p>
  );
}

function TodoView({ todos }: { todos: Todo[] }) {
  const groups: { id: string; label: string; color: string; items: Todo[] }[] = [
    { id: "late", label: "En retard", color: C.coral, items: todos.filter((t) => t.date && daysUntil(t.date) < 0) },
    { id: "week", label: "Cette semaine", color: C.sun, items: todos.filter((t) => t.date && daysUntil(t.date) >= 0 && daysUntil(t.date) <= 7) },
    { id: "later", label: "Plus tard", color: C.t3, items: todos.filter((t) => t.date && daysUntil(t.date) > 7) },
    { id: "none", label: "Sans échéance légale", color: C.t3, items: todos.filter((t) => !t.date) },
  ];
  if (!todos.length) {
    return <div style={{ marginTop: 24 }}><EmptyState icon={Shield} title="Rien à faire" text="Aucune alerte ouverte, aucun brouillon, aucune échéance du programme dans les quatre prochains mois." /></div>;
  }
  return (
    <div style={{ display: "grid", gap: 30, marginTop: 24, maxWidth: 880 }}>
      {groups.filter((g) => g.items.length).map((g, i) => (
        <section key={g.id} style={{ animation: `ui-in .5s cubic-bezier(.22,1,.36,1) ${i * 0.06}s both` }}>
          <p style={{ margin: "0 0 4px", fontSize: 12.5, color: g.color }}>{g.label} · {g.items.length}</p>
          {g.items.map((t) => {
            const d = t.date ? daysUntil(t.date) : null;
            return (
              <button key={t.key} type="button" className="ui-row" onClick={t.onClick}
                style={{ all: "unset", boxSizing: "border-box", width: "100%", cursor: "pointer", display: "flex", alignItems: "center", gap: 18, padding: "12px 0", fontFamily: FONT }}>
                <span style={{ width: 52, flexShrink: 0, textAlign: "center" }}>
                  {t.date ? (
                    <>
                      <span style={{ display: "block", fontSize: 26, fontWeight: 600, letterSpacing: "-0.04em", lineHeight: 1, fontVariantNumeric: "tabular-nums", color: g.id === "late" ? C.coral : g.id === "week" ? C.t1 : C.t2 }}>{Number(t.date.slice(8, 10))}</span>
                      <span style={{ display: "block", marginTop: 3, fontSize: 11.5, color: C.t3 }}>{monthShort(t.date)}</span>
                    </>
                  ) : null}
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 14.5, color: C.t1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</span>
                  <span style={{ display: "block", marginTop: 2, fontSize: 12.5, color: C.t3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {t.sub}{d !== null && <span style={{ color: g.color }}> · {d < 0 ? `${-d} j de retard` : d === 0 ? "aujourd'hui" : `dans ${d} j`}</span>}
                  </span>
                </span>
                {t.who && <span style={{ fontSize: 12.5, color: C.t3, flexShrink: 0 }}>{t.who}</span>}
              </button>
            );
          })}
        </section>
      ))}
    </div>
  );
}

// ──────────────── Panneau principal ────────────────

type ComplianceTab = "afaire" | "alertes" | "declarations" | "dossiers" | "programme";
type Overlay = null | "alert" | "declarer" | "decl-detail" | "signaler";

const CompliancePanel = ({ orders, onOpenOrder, onShowClient }: { orders: AdminOrder[]; onOpenOrder?: (id: string) => void; onShowClient?: (id: string) => void }) => {
  const { user } = useAuth();
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [tab, setTab] = useState<ComplianceTab>("afaire");
  // Dernier état connu affiché tout de suite (mémoire de la session), mis à jour ensuite.
  type Lists = { a: ComplianceAlert[]; d: ComplianceDeclaration[]; c: ChecklistItem[] };
  const cached = peek<Lists>("cmp")?.value;
  const [alerts, setAlerts] = useState<ComplianceAlert[]>(cached?.a ?? []);
  const [declarations, setDeclarations] = useState<ComplianceDeclaration[]>(cached?.d ?? []);
  const [checklist, setChecklist] = useState<ChecklistItem[]>(cached?.c ?? []);
  const [stats, setStats] = useState<RegisterStats | null>(peek<RegisterStats>("cmp.stats")?.value ?? null);
  const [sanctionLists, setSanctionLists] = useState<SanctionListStatus[] | null>(peek<SanctionListStatus[]>("cmp.sanctions")?.value ?? null);
  const [loaded, setLoaded] = useState(!!cached);
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState<RecordCategoryId | null>(null);
  const [selectedAlertId, setSelectedAlertId] = useState<string | null>(null);
  const [selectedDeclId, setSelectedDeclId] = useState<string | null>(null);
  /** Brouillon repris : on met à jour la même déclaration. */
  const [editingDeclId, setEditingDeclId] = useState<string | null>(null);
  const [declForm, setDeclForm] = useState<DeclarationFormData | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!successMsg) return;
    const t = setTimeout(() => setSuccessMsg(null), 4000);
    return () => clearTimeout(t);
  }, [successMsg]);

  const load = useCallback(async () => {
    try {
      const { a, d, c } = await fetchCached<Lists>("cmp", async () => {
        const [a, d, c] = await Promise.all([fetchAlerts(), fetchDeclarations(), fetchChecklist()]);
        return { a, d, c };
      });
      setAlerts(a); setDeclarations(d); setChecklist(c);
    } catch (e) {
      setErrorMsg(`Chargement impossible : ${(e as Error).message}`);
    } finally {
      setLoaded(true);
    }
    fetchCached("cmp.stats", fetchRegisterStats).then(setStats).catch(() => setStats(null));
    fetchCached("cmp.sanctions", fetchSanctionStatus).then(setSanctionLists).catch(() => setSanctionLists([]));
  }, []);
  useEffect(() => { if (loaded) put<Lists>("cmp", { a: alerts, d: declarations, c: checklist }); }, [alerts, declarations, checklist, loaded]);

  useEffect(() => { void load(); }, [load]);
  // En direct : une nouvelle alerte de l'analyse, une alerte prise ou fermée par un collègue.
  useEffect(() => {
    let timer: number | undefined;
    const ch = supabase.channel("admin-compliance")
      .on("postgres_changes", { event: "*", schema: "public", table: "compliance_alerts" }, () => {
        window.clearTimeout(timer);
        timer = window.setTimeout(() => { fetchAlerts().then(setAlerts).catch(() => undefined); }, 400);
      })
      .subscribe();
    return () => { window.clearTimeout(timer); void supabase.removeChannel(ch); };
  }, []);

  /** Exécute une action en base, avec message d'erreur clair. */
  const act = async (fn: () => Promise<void>) => {
    setBusy(true); setErrorMsg(null);
    try { await fn(); } catch (e) { setErrorMsg((e as Error).message); } finally { setBusy(false); }
  };

  const activeAlerts = alerts.filter(isOpen).length;
  const pendingDecl = declarations.filter((d) => d.status === "brouillon" || d.status === "soumise").length;

  // Prochaine échéance DOIMV : alerte ouverte ou brouillon.
  const nextDeadline = useMemo(() => {
    const dates = [
      ...alerts.filter((a) => isOpen(a) && a.dueDate).map((a) => a.dueDate!),
      ...declarations.filter((d) => d.status === "brouillon" && d.dueDate).map((d) => d.dueDate!),
    ].sort();
    return dates[0] ?? null;
  }, [alerts, declarations]);

  const closeAll = () => {
    setOverlay(null); setSelectedAlertId(null); setSelectedDeclId(null); setEditingDeclId(null); setDeclForm(null);
  };

  const prendreEnCharge = (id: string) => act(async () => {
    const previous = alerts.find((a) => a.id === id) ?? null;
    await takeAlert(id);
    setAlerts((prev) => prev.map((a) => (a.id === id ? { ...a, status: "en_cours", assignedTo: user?.name || user?.email || "Vous", mine: true } : a)));
    setSuccessMsg("Alerte prise en charge. Vous en êtes responsable.");
    void logAdminAction({
      action: "compliance.take_charge",
      entityKind: "compliance_case",
      entityId: id,
      before: previous ? { status: previous.status } : null,
      after: { status: "en_cours" },
      metadata: { alert_ref: previous?.ref ?? null, alert_type: previous?.type ?? null, client_email: previous?.clientEmail ?? null },
    });
  });

  const submitClasser = (reason: string, notes: string) => {
    const id = selectedAlertId;
    if (!id) return;
    return act(async () => {
      const previous = alerts.find((a) => a.id === id) ?? null;
      await classifyAlert(id, reason, notes);
      setAlerts((prev) => prev.map((a) => (a.id === id
        ? { ...a, status: "classe", classification: reason, notes, closedAt: new Date().toISOString().slice(0, 10) } : a)));
      void logAdminAction({
        action: "compliance.classify",
        entityKind: "compliance_case",
        entityId: id,
        before: previous ? { status: previous.status } : null,
        after: { status: "classe" },
        metadata: { alert_ref: previous?.ref ?? null, reason, notes: notes || null, alert_type: previous?.type ?? null },
      });
      closeAll(); setTab("alertes");
      setSuccessMsg("Alerte classée sans suite.");
    });
  };

  const openDeclarer = (id: string) => {
    const a = alerts.find((x) => x.id === id);
    if (!a) return;
    const order = a.orderId ? orders.find((o) => o.id === a.orderId) : undefined;
    setSelectedAlertId(id); setEditingDeclId(null);
    setDeclForm(initialDeclarationForm(a, order)); setOverlay("declarer");
    // Ce que le client a déclaré à sa vérification d'identité complète le formulaire (sans écraser une saisie).
    if (a.userId) {
      void fetchKycIdentity(a.userId).then((k) => {
        if (!k) return;
        const provinceCode = PROVINCES.find((p) => p.code === k.province)?.code ?? k.province;
        setDeclForm((f) => f && ({
          ...f,
          clientDob: f.clientDob || k.birthDate,
          clientAddress: f.clientAddress || k.addressLine,
          clientCity: f.clientCity || k.city,
          clientProvince: f.clientProvince || provinceCode,
          clientPostalCode: f.clientPostalCode || k.postalCode,
          clientOccupation: f.clientOccupation || k.occupation,
          clientIdType: f.clientIdType || ((ID_TYPES as readonly string[]).includes(k.docType) ? k.docType : ""),
        }));
      });
    }
  };

  const resumeDraft = () => {
    const d = declarations.find((x) => x.id === selectedDeclId);
    if (!d?.formData) return;
    setEditingDeclId(d.id); setSelectedAlertId(d.alertId ?? null);
    setDeclForm(d.formData); setOverlay("declarer");
  };

  const submitDeclaration = (asBrouillon: boolean, canafeRef: string) => {
    if (!declForm) return;
    const alert = selectedAlertId ? alerts.find((a) => a.id === selectedAlertId) : undefined;
    const existing = editingDeclId ? declarations.find((d) => d.id === editingDeclId) : undefined;
    // Échéance légale : DOIMV = 5 jours ouvrables après la réception ; DBT = aujourd'hui ; DOT = dès que possible.
    const dueDate = declForm.type === "doimv"
      ? alert?.dueDate ?? addBusinessDays(declForm.operationDate || new Date().toISOString(), DOIMV_DEADLINE_BUSINESS_DAYS)
      : declForm.type === "dbt" ? new Date().toISOString().slice(0, 10) : undefined;
    const status: DeclarationStatus = asBrouillon ? "brouillon" : "soumise";

    return act(async () => {
      const saved = await saveDeclaration({
        id: existing?.id, alertId: alert?.id, userId: alert?.userId,
        form: declForm, status, dueDate, canafeRef,
      });
      setDeclarations((prev) => [saved, ...prev.filter((d) => d.id !== saved.id)]);
      if (!asBrouillon && alert && alert.status !== "declare") {
        await markAlertDeclared(alert.id);
        setAlerts((prev) => prev.map((a) => (a.id === alert.id ? { ...a, status: "declare" } : a)));
      }
      void logAdminAction({
        action: asBrouillon ? "compliance.declaration_draft" : "compliance.declaration_submit",
        entityKind: "compliance_declaration",
        entityId: saved.id,
        after: { ref: saved.ref, type: saved.type, amount: saved.amount, dueDate: saved.dueDate ?? null, status: saved.status, canafe_ref: saved.canafRef ?? null },
        metadata: { alert_ref: alert?.ref ?? null, client_name: saved.clientName },
      });
      closeAll(); setTab("declarations");
      setSuccessMsg(asBrouillon ? `Brouillon ${saved.ref} enregistré.` : `Déclaration ${saved.ref} marquée comme soumise au CANAFE.`);
    });
  };

  const changeDeclStatus = (status: DeclarationStatus, canafeRef?: string) => {
    const d = declarations.find((x) => x.id === selectedDeclId);
    if (!d) return;
    return act(async () => {
      const saved = await updateDeclarationStatus(d.id, status, canafeRef);
      setDeclarations((prev) => prev.map((x) => (x.id === saved.id ? saved : x)));
      if (status === "soumise" && d.alertId) {
        const alert = alerts.find((a) => a.id === d.alertId);
        if (alert && alert.status !== "declare") {
          await markAlertDeclared(alert.id);
          setAlerts((prev) => prev.map((a) => (a.id === alert.id ? { ...a, status: "declare" } : a)));
        }
      }
      void logAdminAction({
        action: "compliance.declaration_status",
        entityKind: "compliance_declaration",
        entityId: d.id,
        before: { status: d.status, canafe_ref: d.canafRef ?? null },
        after: { status: saved.status, canafe_ref: saved.canafRef ?? null },
        metadata: { ref: d.ref },
      });
      setSuccessMsg(`Déclaration ${d.ref} : ${DECL_STATUS_META[saved.status].label.toLowerCase()}.`);
    });
  };

  const scan = () => act(async () => {
    const n = await runScan();
    await load();
    setSuccessMsg(n > 0 ? `${n} nouvelle${n > 1 ? "s" : ""} alerte${n > 1 ? "s" : ""}.` : "Analyse terminée : aucune nouvelle alerte.");
  });

  const submitSignaler = (input: { type: AlertType; email: string; orderRef: string; amount: number; reason: string }) =>
    act(async () => {
      const client = await findClientByEmail(input.email);
      if (!client) throw new Error(`Aucun client avec le courriel ${input.email}.`);
      const order = input.orderRef ? orders.find((o) => o.ref === input.orderRef) : undefined;
      const created = await createManualAlert({
        type: input.type, userId: client.id, orderId: order?.id ?? null, amount: input.amount, reason: input.reason.trim(),
      });
      setAlerts((prev) => [created, ...prev]);
      void logAdminAction({
        action: "compliance.alert_create",
        entityKind: "compliance_case",
        entityId: created.id,
        after: { ref: created.ref, type: created.type, amount: created.amount },
        metadata: { client_email: client.email, order_ref: order?.ref ?? null },
      });
      closeAll(); setTab("alertes");
      setSuccessMsg(`Alerte ${created.ref} ouverte et prise en charge.`);
    });

  const exportRegister = async (kind: RecordCategoryId, from?: string, to?: string, format: "pdf" | "detail" | "csv" = "pdf") => {
    setExporting(kind); setErrorMsg(null);
    try {
      const n = await downloadRegister(kind, from, to, format);
      setSuccessMsg(n > 0 ? `${n} ligne${n > 1 ? "s" : ""} exportée${n > 1 ? "s" : ""}.` : "Aucune donnée sur cette période.");
      void logAdminAction({ action: "compliance.register_export", entityKind: "compliance_register", metadata: { kind, format, from: from ?? null, to: to ?? null, rows: n } });
    } catch (e) {
      setErrorMsg(`Export impossible : ${(e as Error).message}`);
    } finally {
      setExporting(null);
    }
  };

  const toggleChecklist = (id: string) => act(async () => {
    const item = checklist.find((c) => c.id === id);
    if (!item) return;
    await setChecklistItem(id, { done: !item.done });
    setChecklist((prev) => prev.map((c) => (c.id === id
      ? { ...c, done: !c.done, doneAt: !c.done ? new Date().toISOString().slice(0, 10) : undefined } : c)));
    void logAdminAction({ action: "compliance.program_toggle", entityKind: "compliance_program", metadata: { item: id, done: !item.done } });
  });

  const saveEvidence = (id: string, evidence: string) => act(async () => {
    await setChecklistItem(id, { evidence });
    setChecklist((prev) => prev.map((c) => (c.id === id ? { ...c, evidence: evidence.trim() || undefined } : c)));
  });

  const todos = buildTodos(alerts, declarations, checklist, {
    alert: (a) => { setSelectedAlertId(a.id); setOverlay("alert"); },
    decl: (id) => { setSelectedDeclId(id); setOverlay("decl-detail"); },
    programme: () => setTab("programme"),
  });
  const selectedAlert = selectedAlertId ? alerts.find((a) => a.id === selectedAlertId) : null;
  const selectedDecl = selectedDeclId ? declarations.find((d) => d.id === selectedDeclId) : null;
  const editingDecl = editingDeclId ? declarations.find((d) => d.id === editingDeclId) : null;

  return (
    <div>
      {(successMsg || errorMsg) && (
        <div style={{ display: "grid", gap: 8, marginBottom: 16 }}>
          {successMsg && <Notice tone="ok">{successMsg}</Notice>}
          {errorMsg && <Notice tone="err"><span style={{ display: "flex", gap: 12 }}><span style={{ flex: 1 }}>{errorMsg}</span><button type="button" onClick={() => setErrorMsg(null)} style={{ all: "unset", cursor: "pointer", textDecoration: "underline" }}>Fermer</button></span></Notice>}
        </div>
      )}

      <ComplianceHero loaded={loaded} alerts={activeAlerts} pendingDecl={pendingDecl} nextDeadline={nextDeadline}
        checklist={checklist.map((c) => ({ label: c.label, done: c.done, category: c.category }))} />

      <Tabs value={tab} onChange={setTab} items={[
        { id: "afaire", label: "À faire", count: todos.length || undefined, tone: todos.some((t) => t.date && daysUntil(t.date) < 0) ? "danger" : "warn" },
        { id: "alertes", label: "Alertes", count: activeAlerts || undefined, tone: "warn" },
        { id: "declarations", label: "Déclarations", count: pendingDecl || undefined },
        { id: "dossiers", label: "Registre" },
        { id: "programme", label: "Programme" },
      ]} />

      {tab === "afaire" && <><Watch lists={sanctionLists} /><TodoView todos={todos} /></>}
      {tab === "alertes" && (
        <AlertesView alerts={alerts} busy={busy} selectedId={overlay === "alert" ? selectedAlertId : null}
          onOpen={(a) => { setSelectedAlertId(a.id); setOverlay("alert"); }}
          onScan={scan} onSignaler={() => setOverlay("signaler")} />
      )}
      {tab === "declarations" && (
        <DeclarationsView declarations={declarations} selectedId={overlay === "decl-detail" ? selectedDeclId : null}
          onOpen={(id) => { setSelectedDeclId(id); setOverlay("decl-detail"); }} />
      )}
      {tab === "dossiers" && <RegistreView stats={stats} onExport={exportRegister} busyKind={exporting} />}
      {tab === "programme" && <ProgrammeView checklist={checklist} onToggle={toggleChecklist} onEvidence={saveEvidence} busy={busy} />}

      {overlay === "alert" && selectedAlert && (
        <ComplianceAlertView alert={selectedAlert} alerts={alerts} orders={orders} busy={busy} onClose={closeAll}
          onTake={() => prendreEnCharge(selectedAlert.id)}
          onClassify={submitClasser}
          onDeclare={() => openDeclarer(selectedAlert.id)}
          onOpenAlert={(a) => setSelectedAlertId(a.id)}
          onOpenOrder={onOpenOrder && ((id) => { closeAll(); onOpenOrder(id); })}
          onShowClient={onShowClient && ((id) => { closeAll(); onShowClient(id); })} />
      )}
      {overlay === "declarer" && declForm && (
        <DeclarationWorkspace
          sourceRef={selectedAlert?.ref ?? editingDecl?.ref ?? "Déclaration"}
          dueDate={selectedAlert?.dueDate ?? editingDecl?.dueDate}
          form={declForm} onChange={setDeclForm} onSubmit={submitDeclaration} busy={busy}
          onClose={() => { if (confirm("Fermer sans enregistrer ? Les informations saisies seront perdues.")) closeAll(); }}
        />
      )}
      {overlay === "decl-detail" && selectedDecl && (
        <DeclarationPanel key={selectedDecl.id + selectedDecl.status} decl={selectedDecl} onClose={closeAll}
          onResume={resumeDraft} onStatus={changeDeclStatus} busy={busy} />
      )}
      {overlay === "signaler" && (
        <SignalerPanel orders={orders} onSubmit={submitSignaler} onClose={closeAll} busy={busy} />
      )}
    </div>
  );
};

export default CompliancePanel;
