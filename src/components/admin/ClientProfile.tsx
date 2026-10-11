import { useEffect, useState } from "react";
import { Check, Copy, Loader2, ShoppingCart, Wand2 } from "lucide-react";
import { nfCad } from "@/lib/adminOrders";
import { orderRef } from "@/lib/orders";
import {
  fetchClientProfile, fetchClientOrders, KYC_LABEL,
  type ClientProfile as ClientProfileData, type ClientOrder,
} from "@/lib/adminClient";
import { summarizeClient, isAIError, toAIClientContext, toAIOrderSummaries } from "@/lib/ai";
import { useAuth } from "@/lib/auth";
import { resetKyb } from "@/lib/adminKyb";
import { fetchOrigin, placeLabel, type SignupOrigin } from "@/lib/origin";
import { C, FONT } from "./adminTheme";
import { Button, Notice } from "./ui";
import { Avatar, DataTable, EmptyState, KeyValues, Pill, StatStrip, TwoLine, type Column, type Tone } from "./layout";
import ClientNotes from "./ClientNotes";
import ClientTimeline from "./ClientTimeline";
import RiskScoreCard from "./RiskScoreCard";

interface Props {
  userId: string;
  clientName: string;
  onBack: () => void;
  onOpenOrder?: (orderId: string) => void;
}

const dateFmt = new Intl.DateTimeFormat("fr-CA", { day: "numeric", month: "long", year: "numeric" });
const dateShort = new Intl.DateTimeFormat("fr-CA", { day: "numeric", month: "short", year: "numeric" });
const nfUsdt = new Intl.NumberFormat("fr-CA", { maximumFractionDigits: 2 });

const ORDER_STATUS: Record<string, [string, Tone]> = {
  created: ["Créée", "neutral"], awaiting_payment: ["En attente", "neutral"], payment_received: ["Payée · à traiter", "warn"],
  settling: ["En cours", "info"], completed: ["Terminée", "ok"], cancelled: ["Annulée", "danger"], expired: ["Expirée", "neutral"], refunded: ["Remboursée", "neutral"],
};
const KYC_TONE: Record<string, Tone> = { approved: "ok", pending: "warn", rejected: "danger", not_started: "neutral" };

function Block({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section style={{ marginTop: 32 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 10 }}>
        <h2 style={{ margin: 0, flex: 1, fontSize: 15, fontWeight: 500 }}>{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}

const ClientProfile = ({ userId, clientName, onOpenOrder }: Props) => {
  const { isAdmin } = useAuth();
  const [profile, setProfile] = useState<ClientProfileData | null>(null);
  const [origin, setOrigin] = useState<SignupOrigin | null>(null);
  const [orders, setOrders] = useState<ClientOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState<string | null>(null);
  const [resetStep, setResetStep] = useState<"idle" | "confirm" | "busy">("idle");
  const [resetMsg, setResetMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([fetchClientProfile(userId), fetchClientOrders(userId), fetchOrigin(userId)]).then(([p, o, g]) => {
      if (!active) return;
      setProfile(p); setOrders(o); setOrigin(g); setLoading(false);
    });
    return () => { active = false; };
  }, [userId]);

  const copy = (value: string, key: string) => {
    navigator.clipboard?.writeText(value).catch(() => {});
    setCopied(key);
    setTimeout(() => setCopied((c) => (c === key ? null : c)), 1200);
  };
  const copyable = (value: string | null | undefined, key: string, mono = false) => value ? (
    <button type="button" onClick={() => copy(value, key)} title="Copier"
      style={{ all: "unset", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 8, wordBreak: "break-all", fontFamily: mono ? "ui-monospace, Menlo, monospace" : FONT, fontSize: mono ? 12.5 : 13.5 }}>
      {value}{copied === key ? <Check style={{ width: 14, height: 14, color: C.successText }} /> : <Copy style={{ width: 13, height: 13, color: C.t3 }} />}
    </button>
  ) : <span style={{ color: C.t3 }}>—</span>;

  const runSummary = async () => {
    if (!profile || aiBusy) return;
    setAiBusy(true); setAiError(null);
    const res = await summarizeClient({ client: toAIClientContext(profile), orders: toAIOrderSummaries(orders) });
    setAiBusy(false);
    if (isAIError(res)) setAiError(res.error); else setAiSummary(res.summary);
  };

  const doReset = async () => {
    if (!profile) return;
    setResetStep("busy");
    const res = await resetKyb(userId, { businessStatus: profile.businessStatus, businessName: profile.businessName });
    setResetStep("idle");
    if (res.error) { setResetMsg({ ok: false, text: res.error }); return; }
    setProfile((p) => (p ? { ...p, businessStatus: "not_started" } : p));
    setResetMsg({ ok: true, text: "Vérification réinitialisée : le client repart d'un dossier vide." });
  };

  const name = profile?.fullName ?? clientName;
  if (loading) return <p style={{ padding: "60px 0", textAlign: "center", fontSize: 13.5, color: C.t3 }}>Chargement de la fiche…</p>;

  const completed = orders.filter((o) => o.status === "completed");
  const columns: Column<ClientOrder>[] = [
    { key: "op", header: "Opération", render: (o) => <TwoLine primary={`${o.side === "buy" ? "Achat" : "Vente"} · ${nfUsdt.format(o.usdtAmount)} USDT`} secondary={orderRef(o.id)} /> },
    { key: "status", header: "Statut", render: (o) => { const s = ORDER_STATUS[o.status] ?? [o.status, "neutral" as Tone]; return <Pill tone={s[1]} dot>{s[0]}</Pill>; } },
    { key: "amount", header: "Montant", align: "right", sort: (o) => o.cadAmount, render: (o) => `${nfCad.format(o.cadAmount)} $` },
    { key: "date", header: "Date", align: "right", sort: (o) => o.createdAt, hideBelow: 700, render: (o) => <span style={{ color: C.t2 }}>{dateShort.format(new Date(o.createdAt))}</span> },
  ];

  return (
    <div>
      <header style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap", marginBottom: 24 }}>
        <Avatar name={name} size={52} />
        <div style={{ flex: "1 1 260px", minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 500, letterSpacing: "-0.02em" }}>{profile?.accountType === "business" && profile.businessName ? profile.businessName : name}</h1>
            {profile && <Pill tone={KYC_TONE[profile.kycStatus] ?? "neutral"} dot>{KYC_LABEL[profile.kycStatus]}</Pill>}
            {profile?.accountType === "business" && <Pill>Entreprise</Pill>}
          </div>
          <p style={{ margin: "4px 0 0", fontSize: 13.5, color: C.t3 }}>
            {profile?.email ?? "—"}{profile?.createdAt && <> · client depuis le {dateFmt.format(new Date(profile.createdAt))}</>}
          </p>
        </div>
        <Button icon={aiBusy ? <Loader2 style={{ width: 15, height: 15, animation: "spin 1s linear infinite" }} /> : <Wand2 style={{ width: 15, height: 15 }} />} onClick={runSummary} disabled={aiBusy || !profile}>
          {aiBusy ? "Analyse…" : aiSummary ? "Régénérer le résumé" : "Résumé par l'assistant"}
        </Button>
      </header>

      {(aiSummary || aiError) && (
        <div style={{ marginBottom: 24 }}>
          {aiError ? <Notice tone="err">{aiError}</Notice> : (
            <div style={{ padding: "14px 0", borderTop: `1px solid ${C.bds}`, borderBottom: `1px solid ${C.bds}`, fontSize: 13.5, lineHeight: 1.7, whiteSpace: "pre-wrap", color: C.t1 }}>{aiSummary}</div>
          )}
        </div>
      )}

      <StatStrip items={[
        { label: "Volume traité", value: `${nfCad.format(profile?.totalCad ?? 0)} $` },
        { label: "Commandes", value: Math.max(profile?.orderCount ?? 0, orders.length), hint: `${completed.length} terminée${completed.length > 1 ? "s" : ""}` },
        { label: "Limite quotidienne", value: profile ? `${nfCad.format(profile.dailyLimitCad)} $` : "—" },
        { label: "Dernière commande", value: orders[0] ? dateShort.format(new Date(orders[0].createdAt)) : "Aucune" },
      ]} />

      <div className="grid grid-cols-1 gap-x-12 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div style={{ minWidth: 0 }}>
          <Block title={`Commandes (${orders.length})`}>
            <DataTable rows={orders} columns={columns} rowKey={(o) => o.id} onRowClick={(o) => onOpenOrder?.(o.id)} initialSort={{ key: "date", dir: "desc" }}
              empty={<EmptyState icon={ShoppingCart} title="Aucune commande" text="Ce client n'a encore rien acheté ni vendu." />}
              mobile={(o) => { const s = ORDER_STATUS[o.status] ?? [o.status, "neutral" as Tone]; return (
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}><TwoLine primary={`${o.side === "buy" ? "Achat" : "Vente"} · ${nfCad.format(o.cadAmount)} $`} secondary={`${orderRef(o.id)} · ${dateShort.format(new Date(o.createdAt))}`} /></div>
                  <Pill tone={s[1]} dot>{s[0]}</Pill>
                </div>
              ); }} />
          </Block>
          {profile && <Block title="Chronologie"><ClientTimeline profile={profile} orders={orders} userId={userId} /></Block>}
        </div>

        <aside style={{ minWidth: 0 }}>
          <Block title="Coordonnées">
            <KeyValues items={[
              ["Nom", name],
              ["Courriel", copyable(profile?.email, "email")],
              ["Téléphone", copyable(profile?.phone, "phone")],
              [origin?.late ? "Lieu (connexion)" : "Lieu d'inscription", placeLabel(origin) ?? <span style={{ color: C.t3 }}>Pas encore connu</span>],
              ["Source", origin?.source ? [origin.source, origin.campaign].filter(Boolean).join(" · ") : <span style={{ color: C.t3 }}>Pas encore connue</span>],
              ...(profile?.interacQuestion ? [["Question Interac", profile.interacQuestion] as [string, React.ReactNode]] : []),
              ...(profile?.interacAnswer ? [["Réponse Interac", copyable(profile.interacAnswer, "ans")] as [string, React.ReactNode]] : []),
              ["Identifiant", copyable(userId, "uid", true)],
            ]} />
          </Block>

          {profile?.accountType === "business" && (
            <Block title="Entreprise">
              <KeyValues items={[
                ["Raison sociale", profile.businessName ?? "—"],
                ["Vérification", { not_started: "Non commencée", pending: "En attente", approved: "Vérifiée", rejected: "Refusée" }[profile.businessStatus] ?? profile.businessStatus],
                ...(profile.businessNumber ? [["NEQ / BN", copyable(profile.businessNumber, "neq")] as [string, React.ReactNode]] : []),
                ...(profile.businessAddress ? [["Adresse", profile.businessAddress] as [string, React.ReactNode]] : []),
                ...(profile.businessPhone ? [["Téléphone", profile.businessPhone] as [string, React.ReactNode]] : []),
              ]} />
              {isAdmin && (profile.businessStatus !== "not_started" || resetMsg) && (
                <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                  {resetMsg && <Notice tone={resetMsg.ok ? "ok" : "err"}>{resetMsg.text}</Notice>}
                  {profile.businessStatus !== "not_started" && (resetStep === "confirm" ? (
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                      <span style={{ fontSize: 13, color: C.t2, flex: "1 1 160px" }}>Supprimer son dossier et le faire recommencer ?</span>
                      <Button size="sm" variant="ghost" onClick={() => setResetStep("idle")}>Annuler</Button>
                      <Button size="sm" variant="danger" onClick={doReset}>Réinitialiser</Button>
                    </div>
                  ) : (
                    <Button size="sm" variant="ghost" disabled={resetStep === "busy"} onClick={() => { setResetMsg(null); setResetStep("confirm"); }}>
                      {resetStep === "busy" ? "Réinitialisation…" : "Réinitialiser la vérification d'entreprise"}
                    </Button>
                  ))}
                </div>
              )}
            </Block>
          )}

          {profile && <Block title="Score de risque"><RiskScoreCard profile={profile} /></Block>}
          <Block title="Notes internes"><ClientNotes userId={userId} /></Block>
        </aside>
      </div>
    </div>
  );
};

export default ClientProfile;
