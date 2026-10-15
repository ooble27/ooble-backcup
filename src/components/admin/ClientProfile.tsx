import { useEffect, useState } from "react";
import { useCan } from "@/lib/roles";
import { prefetchOrder } from "@/lib/orderDetailCache";
import { Check, Copy, FileText, History, Loader2, ShoppingCart, Wand2 } from "lucide-react";
import ClientOrdersHistory from "./ClientOrdersHistory";
import { nfCad } from "@/lib/adminOrders";
import { orderRef } from "@/lib/orders";
import { KYC_LABEL, type ClientProfile as ClientProfileData, type ClientOrder } from "@/lib/adminClient";
import { loadClient, peekClient } from "@/lib/clientProfileCache";
import { summarizeClient, isAIError, toAIClientContext, toAIOrderSummaries } from "@/lib/ai";
import { logAdminAction } from "@/lib/audit";
import { placeLabel, type SignupOrigin } from "@/lib/origin";
import { C, FONT } from "./adminTheme";
import { Button, Notice } from "./ui";
import { Avatar, DataTable, EmptyState, KeyValues, Pill, TwoLine, type Column, type Tone } from "./layout";
import ClientNotes from "./ClientNotes";
import ClientTimeline from "./ClientTimeline";
import RiskScoreCard from "./RiskScoreCard";
import ClientAccess from "./ClientAccess";
import ClientWallets from "./ClientWallets";

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
  // Registre du client : Administrateur et Conformité.
  const can = useCan();
  const canRegister = can("register.export");
  const [regBusy, setRegBusy] = useState(false);
  const downloadRegister = async () => {
    setRegBusy(true);
    try {
      const { downloadClientRegister } = await import("@/lib/complianceLive");
      const n = await downloadClientRegister(userId, clientName || "Client");
      void logAdminAction({ action: "compliance.client_register_export", entityKind: "profile", entityId: userId, metadata: { rows: n } });
    } finally { setRegBusy(false); }
  };
  // Déjà en mémoire (préchargée au survol de la ligne) : la fiche s'affiche sans attente.
  const cached = peekClient(userId);
  const [profile, setProfile] = useState<ClientProfileData | null>(cached?.profile ?? null);
  const [origin, setOrigin] = useState<SignupOrigin | null>(cached?.origin ?? null);
  const [orders, setOrders] = useState<ClientOrder[]>(cached?.orders ?? []);
  const [loading, setLoading] = useState(!cached);
  const [copied, setCopied] = useState<string | null>(null);
  // La fiche montre les 6 dernières commandes ; l'historique complet a sa propre page.
  const [history, setHistory] = useState(false);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const hit = peekClient(userId);
    if (hit) { setProfile(hit.profile); setOrders(hit.orders); setOrigin(hit.origin); setLoading(false); }
    else setLoading(true);
    // Mise à jour discrète en arrière-plan (ou premier chargement).
    loadClient(userId).then(({ profile: p, orders: o, origin: g }) => {
      if (!active) return;
      setProfile(p); setOrders(o); setOrigin(g); setLoading(false);
    }).catch(() => { if (active) setLoading(false); });
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

  const name = profile?.fullName ?? clientName;
  // Rare (fiche jamais visée avant) : le nom s'affiche déjà, le reste arrive en fondu, sans message de chargement.
  if (loading) return (
    <header style={{ marginBottom: 26 }}>
      <Avatar name={name} size={44} />
      <h1 className="hz-title" style={{ marginTop: 16 }}>{name}</h1>
    </header>
  );

  const completed = orders.filter((o) => o.status === "completed");
  const columns: Column<ClientOrder>[] = [
    { key: "op", header: "Opération", render: (o) => <TwoLine primary={`${o.side === "buy" ? "Achat" : "Vente"} · ${nfUsdt.format(o.usdtAmount)} USDT`} secondary={orderRef(o.id)} /> },
    { key: "status", header: "Statut", render: (o) => { const s = ORDER_STATUS[o.status] ?? [o.status, "neutral" as Tone]; return <Pill tone={s[1]} dot>{s[0]}</Pill>; } },
    { key: "amount", header: "Montant", align: "right", sort: (o) => o.cadAmount, render: (o) => `${nfCad.format(o.cadAmount)} $` },
    { key: "date", header: "Date", align: "right", sort: (o) => o.createdAt, hideBelow: 700, render: (o) => <span style={{ color: C.t2 }}>{dateShort.format(new Date(o.createdAt))}</span> },
  ];

  return (
    <div>
      <header style={{ marginBottom: 26 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <Avatar name={name} size={44} />
          {profile && <Pill tone={KYC_TONE[profile.kycStatus] ?? "neutral"} dot>{KYC_LABEL[profile.kycStatus]}</Pill>}
          {profile?.accountType === "business" && <Pill>Entreprise</Pill>}
          <span style={{ flex: 1 }} />
          {canRegister && (
            // Registre de ce client seul (opérations, identité, alertes), prêt à remettre au CANAFE.
            <Button variant="ghost" disabled={regBusy} onClick={downloadRegister}
              icon={regBusy ? <Loader2 style={{ width: 15, height: 15, animation: "spin 1s linear infinite" }} /> : <FileText style={{ width: 15, height: 15 }} />}>
              {regBusy ? "Préparation…" : "Registre du client (PDF)"}
            </Button>
          )}
          <Button icon={aiBusy ? <Loader2 style={{ width: 15, height: 15, animation: "spin 1s linear infinite" }} /> : <Wand2 style={{ width: 15, height: 15 }} />} onClick={runSummary} disabled={aiBusy || !profile}>
            {aiBusy ? "Analyse…" : aiSummary ? "Régénérer le résumé" : "Résumé par l'assistant"}
          </Button>
        </div>
        <h1 className="hz-title" style={{ marginTop: 16 }}>{profile?.accountType === "business" && profile.businessName ? profile.businessName : name}</h1>
        <p className="hz-sub" style={{ maxWidth: 760 }}>
          {profile?.email ?? "—"}{profile?.createdAt && <> · client depuis le {dateFmt.format(new Date(profile.createdAt))}</>}
        </p>
        {/* Les chiffres du client, en une phrase (au lieu de cases). */}
        <p style={{ margin: "14px 0 0", fontSize: "clamp(18px, 1.8vw, 22px)", lineHeight: 1.35, letterSpacing: "-0.02em", color: C.t2, maxWidth: 820 }}>
          <b style={{ color: C.sun, fontWeight: 600, whiteSpace: "nowrap" }}>{nfCad.format(profile?.totalCad ?? 0)} $</b> échangés en{" "}
          <b style={{ color: C.coral, fontWeight: 600 }}>{Math.max(profile?.orderCount ?? 0, orders.length)}</b> commande{Math.max(profile?.orderCount ?? 0, orders.length) > 1 ? "s" : ""}
          {completed.length ? <>, dont {completed.length} terminée{completed.length > 1 ? "s" : ""}</> : null}.{" "}
          <span style={{ color: C.t3 }}>
            {orders[0] ? `Dernière commande le ${dateShort.format(new Date(orders[0].createdAt))}. ` : "Aucune commande pour l'instant. "}
            {profile ? `Limite quotidienne : ${nfCad.format(profile.dailyLimitCad)} $.` : ""}
          </span>
        </p>
      </header>

      {(aiSummary || aiError) && (
        <div style={{ marginBottom: 24 }}>
          {aiError ? <Notice tone="err">{aiError}</Notice> : (
            <div style={{ padding: "16px 18px", borderRadius: 16, background: C.hover2, fontSize: 13.5, lineHeight: 1.7, whiteSpace: "pre-wrap", color: C.t1 }}>{aiSummary}</div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-x-12 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div style={{ minWidth: 0 }}>
          <Block title={orders.length > 6 ? `6 dernières commandes sur ${orders.length}` : `Commandes (${orders.length})`} right={orders.length > 0 ? (
            <Button size="sm" onClick={() => setHistory(true)} icon={<History style={{ width: 14, height: 14 }} />}>Historique complet</Button>
          ) : undefined}>
            <DataTable rows={[...orders].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 6)} columns={columns} rowKey={(o) => o.id} onRowClick={(o) => onOpenOrder?.(o.id)} onRowIntent={(o) => prefetchOrder(o.id, userId)} initialSort={{ key: "date", dir: "desc" }}
              empty={<EmptyState icon={ShoppingCart} title="Aucune commande" text="Ce client n'a encore rien acheté ni vendu." />}
              mobile={(o) => { const s = ORDER_STATUS[o.status] ?? [o.status, "neutral" as Tone]; return (
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}><TwoLine primary={`${o.side === "buy" ? "Achat" : "Vente"} · ${nfCad.format(o.cadAmount)} $`} secondary={`${orderRef(o.id)} · ${dateShort.format(new Date(o.createdAt))}`} /></div>
                  <Pill tone={s[1]} dot>{s[0]}</Pill>
                </div>
              ); }} />
          </Block>
          {/* Sous les commandes : qui est le client (coordonnées, Interac, portefeuilles), puis la chronologie.
              À droite : notes internes, accès, entreprise, risque. */}
          <Block title="Coordonnées">
            <KeyValues items={[
              ["Nom", name],
              ["Courriel", copyable(profile?.email, "email")],
              ["Téléphone", copyable(profile?.phone, "phone")],
              [origin?.late ? "Lieu (connexion)" : "Lieu d'inscription", placeLabel(origin) ?? <span style={{ color: C.t3 }}>Pas encore connu</span>],
              ["Source", origin?.source ? [origin.source, origin.campaign].filter(Boolean).join(" · ") : <span style={{ color: C.t3 }}>Pas encore connue</span>],
              ["Identifiant", copyable(userId, "uid", true)],
            ]} />
          </Block>
          <Block title="Virements Interac">
            <KeyValues items={[
              ["Destinataire", profile?.email ? copyable(profile.email, "interac") : "—"],
              ...(profile?.interacQuestion ? [["Question", profile.interacQuestion] as [string, React.ReactNode]] : []),
              ...(profile?.interacAnswer ? [["Réponse", copyable(profile.interacAnswer, "ans")] as [string, React.ReactNode]] : []),
            ]} />
            <p style={{ margin: "10px 0 0", fontSize: 12.5, lineHeight: 1.55, color: C.t3 }}>Le courriel du compte est le seul destinataire des ventes.</p>
          </Block>
          <Block title="Portefeuilles connus"><ClientWallets userId={userId} /></Block>
          {profile && <Block title="Chronologie"><ClientTimeline profile={profile} orders={orders} userId={userId} /></Block>}
          {history && <ClientOrdersHistory clientName={name} orders={orders} onClose={() => setHistory(false)} onOpenOrder={onOpenOrder} />}
        </div>

        <aside style={{ minWidth: 0 }}>
          <Block title="Notes internes"><ClientNotes userId={userId} /></Block>

          {(can("accounts.unlock") || can("accounts.suspend")) && <Block title="Accès au compte"><ClientAccess userId={userId} /></Block>}

          {profile?.accountType === "business" && (
            <Block title="Entreprise">
              <KeyValues items={[
                ["Raison sociale", profile.businessName ?? "—"],
                ["Vérification", { not_started: "Non commencée", pending: "En attente", approved: "Vérifiée", rejected: "Refusée" }[profile.businessStatus] ?? profile.businessStatus],
                ...(profile.businessNumber ? [["NEQ / BN", copyable(profile.businessNumber, "neq")] as [string, React.ReactNode]] : []),
                ...(profile.businessAddress ? [["Adresse", profile.businessAddress] as [string, React.ReactNode]] : []),
                ...(profile.businessPhone ? [["Téléphone", profile.businessPhone] as [string, React.ReactNode]] : []),
              ]} />
            </Block>
          )}

          {profile && <Block title="Score de risque"><RiskScoreCard profile={profile} /></Block>}
        </aside>
      </div>
    </div>
  );
};

export default ClientProfile;
