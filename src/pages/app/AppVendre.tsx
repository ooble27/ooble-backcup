import { useEffect, useState } from "react";
import { useAppSettings } from "@/lib/settings";
import { familyOf, useDepositAddresses } from "@/lib/depositAddresses";
import { Link } from "react-router-dom";
import { ArrowRight, Check, Mail, AlertTriangle, MessageSquare, Lock } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import AppShell from "@/components/app/AppShell";
import CopyRow from "@/components/app/CopyRow";
import RecipientBook from "@/components/app/RecipientBook";
import { Action, Actions, AmountField, ClosedPage, Facts, NetworkPick, StepHeader } from "@/components/app/Flat";
import { NETWORKS, openNetworks, type NetId } from "@/components/app/networks";
import { useUsdtRate } from "@/hooks/useUsdtRate";
import { createOrder, getAllowance, orderRef, peekAllowance, type TradeAllowance } from "@/lib/orders";
import { amountText, parseAmount, toCad, toUsdt, type Unit } from "@/lib/tradeAmounts";
import { sendEmail, notifyStaffOfNewOrder } from "@/lib/email";
import { getMyProfile, peekMyProfile } from "@/lib/profile";
import { useAuth } from "@/lib/auth";
import { useT } from "@/lib/i18n";
import { useOtcVisible } from "@/lib/otc";
import { cancelUnsentSell, declareSellSent, isSenderAddress } from "@/lib/sellProof";
import { connectorFor } from "@/lib/walletLink";

type Step = "amount" | "reception" | "network" | "from" | "deposit" | "done";
const short = (a: string) => (a.length > 16 ? `${a.slice(0, 8)}…${a.slice(-6)}` : a);


const nfCad = new Intl.NumberFormat("fr-CA", { maximumFractionDigits: 2, minimumFractionDigits: 2 });
const nfUsdt = new Intl.NumberFormat("fr-CA", { maximumFractionDigits: 2 });

/* Commandes fermées aux clients : la page d'attente. Composant à part, pour que les rôles de
   l'équipe, chargés après le premier affichage, ne changent jamais le nombre de hooks du formulaire. */
const AppVendre = () => {
  const { isStaff, rolesLoading } = useAuth();
  const { tradingEnabled } = useAppSettings();
  const t = useT();
  if (!tradingEnabled && !isStaff) {
    if (rolesLoading) return null;
    return <ClosedPage title={t("sell.title")} message={t("sell.comingSoonMsg")} />;
  }
  return <AppVendreForm />;
};

const AppVendreForm = () => {
  const rate = useUsdtRate();
  const { user, isStaff } = useAuth();
  const { tradeMinCad, tradeDailyMaxCad, networks } = useAppSettings();
  const t = useT();
  const otc = useOtcVisible();


  const [step, setStep] = useState<Step>("amount");
  const [unit, setUnit] = useState<Unit>("USDT");
  const [amount, setAmount] = useState("");
  // Le virement Interac part toujours vers le courriel du compte (la base l'impose aussi) :
  // personne ne peut faire verser l'argent d'une vente sur le compte d'un autre.
  const email = user?.email ?? "";
  const [net, setNet] = useState<NetId | null>(null);
  const [savedRef, setSavedRef] = useState("");
  const [orderId, setOrderId] = useState<string | null>(null);
  const [sender, setSender] = useState("");
  const [linking, setLinking] = useState(false);
  // Adresse lue depuis le portefeuille (« Connecter ») : affichée à part, pas dans le champ à coller.
  const [connected, setConnected] = useState(false);
  const [linkErr, setLinkErr] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [interacQA, setInteracQA] = useState<{ q: string; a: string } | null>(() => {
    const p = peekMyProfile(user?.id);
    return p?.interacQuestion && p?.interacAnswer ? { q: p.interacQuestion, a: p.interacAnswer } : null;
  });

  useEffect(() => {
    getMyProfile().then((p) => {
      if (p?.interacQuestion && p?.interacAnswer) {
        setInteracQA({ q: p.interacQuestion, a: p.interacAnswer });
      }
    });
  }, []);

  // Limites : 100 $ minimum, 9 999 $ au total sur 24 heures, sur le montant
  // en CAD (même règle en base, comptée à part des achats).
  const [allowance, setAllowance] = useState<TradeAllowance | null>(() => peekAllowance(user?.id, "sell") ?? null);
  useEffect(() => { getAllowance("sell").then(setAllowance); }, []);
  // L'équipe Ooble (tous les rôles) vend n'importe quel montant, pour les
  // tests : ni minimum, ni plafond (la base les exempte aussi).
  const minCad = isStaff ? 0 : tradeMinCad;
  const maxCad = isStaff ? Infinity : Math.floor(Math.min(tradeDailyMaxCad, allowance?.remaining ?? tradeDailyMaxCad));
  const blocked = !isStaff && allowance !== null && maxCad < tradeMinCad;

  const sellRate = rate.sell;
  const value = parseAmount(amount);
  const usdt = toUsdt(value, unit, sellRate);
  const cad = toCad(usdt, "USDT", sellRate);
  const belowMin = value > 0 && cad < minCad;

  const maxText = (u: Unit) => amountText(maxCad, u, sellRate, "max");
  const minText = (u: Unit) => amountText(minCad, u, sellRate, "min");

  // Au-delà du maximum permis, la saisie est ramenée au maximum.
  const onAmount = (raw: string) => {
    const clean = raw.replace(/[^\d.,]/g, "");
    if (toCad(toUsdt(parseAmount(clean), unit, sellRate), "USDT", sellRate) > maxCad) setAmount(maxText(unit));
    else setAmount(clean);
  };

  const nextAtText = allowance?.nextAt
    ? allowance.nextAt.toLocaleString("fr-CA", {
        hour: "2-digit", minute: "2-digit",
        ...(allowance.nextAt.toDateString() !== new Date().toDateString() ? { day: "numeric", month: "long" } : {}),
      })
    : "";
  const network = NETWORKS.find((n) => n.id === net) ?? null;
  const deposit = useDepositAddresses();
  const depositAddr = net && deposit ? deposit[familyOf(net)] ?? "" : "";
  const family = net ? familyOf(net) : null;
  const senderOk = !!family && isSenderAddress(family, sender);

  const resetAll = () => {
    setStep("amount"); setAmount(""); setNet(null); setSavedRef(""); setErr(null);
    setOrderId(null); setSender(""); setConnected(false);
  };

  // La vente est créée avant l'envoi : l'adresse de dépôt ne s'affiche qu'ensuite. Un dépôt n'est
  // rattaché automatiquement qu'à une vente qui existait déjà à son arrivée.
  const openSale = async () => {
    if (saving || !senderOk) return;
    if (orderId) { setStep("deposit"); return; }
    setSaving(true);
    setErr(null);
    const res = await createOrder({
      side: "sell",
      cad,
      usdt,
      rate: sellRate,
      network: net ?? undefined,
      address: depositAddr,
      interacEmail: email,
      senderAddress: sender.trim(),
    });
    setSaving(false);
    if ("error" in res) {
      setErr(res.error);
      return;
    }
    setOrderId(res.id);
    setSavedRef(orderRef(res.id));
    setStep("deposit");
  };

  const cancelSale = async () => {
    if (!orderId || saving) return;
    if (!confirm(t("sell.cancelConfirm"))) return;
    setSaving(true);
    const r = await cancelUnsentSell(orderId);
    setSaving(false);
    if (r.error) { setErr(r.error); return; }
    resetAll();
  };

  // « J'ai envoyé mes USDT ».
  const submit = async () => {
    if (saving || !orderId) return;
    setSaving(true);
    setErr(null);
    const res = await declareSellSent(orderId);
    setSaving(false);
    if (res.error) {
      setErr(res.error);
      return;
    }
    const ref = savedRef;
    setStep("done");

    const to = user?.email || email;
    if (to) {
      void sendEmail({
        to,
        template: "order-sell",
        vars: {
          ref,
          usdtAmount: nfUsdt.format(usdt),
          cadAmount: nfCad.format(cad),
          network: network ? `${network.name} · ${network.tag}` : "N/D",
          depositAddress: depositAddr,
          orderUrl: `${window.location.origin}/app`,
        },
      });
    }
    // Prévient le staff (best-effort, silencieux si la config manque).
    void notifyStaffOfNewOrder({
      ref,
      side: "sell",
      cadAmount: nfCad.format(cad),
      usdtAmount: nfUsdt.format(usdt),
      network: network ? `${network.name} · ${network.tag}` : "N/D",
      address: depositAddr,
      clientEmail: user?.email ?? email,
      clientName: user?.name ?? "",
      adminUrl: `${window.location.origin}/admin`,
    });
  };

  const next = (go: () => void, disabled: boolean) => (
    <Actions><Action disabled={disabled} onClick={go}>{t("sell.continue")}</Action></Actions>
  );

  if (step === "amount") {
    return (
      <AppShell center>
        <StepHeader title={t("sell.title")} sub={t("sell.sub")} />
        <AmountField label={t("sell.amount")} units={["USDT", "CAD"] as Unit[]} unit={unit} onUnit={(u) => { setUnit(u); setAmount(""); }}
          value={amount} onChange={onAmount} disabled={blocked}
          onMin={isStaff ? undefined : () => setAmount(minText(unit))} onMax={isStaff ? undefined : () => setAmount(maxText(unit))}>
          {blocked ? (
            <p className="ac-note">{t("sell.limitReached").replace("{time}", nextAtText)}</p>
          ) : belowMin ? (
            <p className="ac-note">{t("sell.minHint")}</p>
          ) : null}
          {otc && !isStaff && (blocked || (value > 0 && cad >= maxCad)) && (
            <Link to="/app/otc" className="ac-link mt-3">{t("trade.otcHint")} <ArrowRight className="h-3.5 w-3.5" /></Link>
          )}
        </AmountField>

        <div className="mt-6">
          <Facts rows={[
            { label: unit === "USDT" ? t("sell.youReceive") : t("sell.youSend"), value: unit === "USDT" ? `${nfCad.format(cad)} CAD` : `${nfUsdt.format(usdt)} USDT`, usdt: unit !== "USDT" },
            { label: t("sell.rate"), value: `1 USDT = ${nfCad.format(sellRate)} CAD` },
          ]} />
        </div>

        {next(() => setStep("reception"), value <= 0 || belowMin || blocked)}
      </AppShell>
    );
  }

  if (step === "reception") {
    return (
      <AppShell center>
        <StepHeader title={t("sell.reception")} sub={t("sell.receptionSub")} onBack={() => setStep("amount")} />
        <p className="ac-k">{t("sell.interacEmail")}</p>
        <div className="mt-1 flex items-center gap-3 py-3">
          <Mail className="h-5 w-5 shrink-0 text-muted-foreground" strokeWidth={1.7} />
          <span className="min-w-0 flex-1 truncate text-[16px] font-medium">{email}</span>
          <Lock className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={1.8} aria-label={t("sell.interacLocked")} />
        </div>
        <p className="ac-help" style={{ marginTop: 2 }}>{t("sell.interacAccountOnly")}</p>

        <p className="mt-6 text-[14px] text-muted-foreground">
          <span className="font-semibold text-foreground">{nfCad.format(cad)} CAD</span> {t("sell.receiveInfo")}
        </p>

        {interacQA && (
          <div className="mt-8">
            <p className="ac-k flex items-center gap-2"><MessageSquare className="h-3.5 w-3.5" strokeWidth={2} /> {t("sell.securityQ")}</p>
            <div className="ac-lines mt-1">
              <CopyRow label={t("sell.question")} value={interacQA.q} />
              <CopyRow label={t("sell.answerToEnter")} value={interacQA.a} mono />
            </div>
          </div>
        )}
        <p className="ac-help">{t("sell.unlockHelp")}</p>

        {next(() => setStep("network"), !email)}
      </AppShell>
    );
  }

  if (step === "network") {
    return (
      <AppShell center>
        <StepHeader title={t("sell.network")} sub={t("sell.networkSub")} onBack={() => setStep("reception")} />
        <NetworkPick list={openNetworks(networks, "sell")} value={net} onPick={(id) => { if (net !== id) { setSender(""); setConnected(false); } setNet(id); }} />
        {next(() => setStep("from"), !net)}
      </AppShell>
    );
  }

  if (step === "from") {
    const connector = family ? connectorFor(family) : null;
    const connect = async () => {
      if (!connector) { setLinkErr(true); return; }
      if ("openUrl" in connector) { window.location.href = connector.openUrl; return; }
      setLinking(true);
      setLinkErr(false);
      try {
        const a = (await connector.connect()).trim();
        if (family && !isSenderAddress(family, a)) setLinkErr(true);
        else { setSender(a); setConnected(true); }
      } catch { setLinkErr(true); }
      setLinking(false);
    };
    return (
      <AppShell center>
        <StepHeader title={t("sell.walletTitle")} sub={`${t("sell.walletSub")} ${network?.tag ?? ""}.`} onBack={() => setStep("network")} />

        {connected && senderOk ? (
          <>
            <p className="ac-k">{t("sell.connected")}</p>
            <div className="ac-kv mono">
              <span>{`${sender.slice(0, 6)}…${sender.slice(-6)}`}</span>
              <button type="button" className="ac-link" onClick={() => { setSender(""); setConnected(false); }}>{t("sell.change")}</button>
            </div>
          </>
        ) : (
          <>
            {/* L'adresse à coller, ou « Connecter » pour la lire depuis le portefeuille. */}
            <div className="flex items-baseline gap-4">
              <label htmlFor="sell-sender" className="ac-k min-w-0 flex-1">{t("sell.senderAddr")}</label>
              <button type="button" className="ac-link shrink-0" disabled={linking} onClick={() => void connect()}>{t("sell.connect")}</button>
            </div>
            <input
              id="sell-sender"
              spellCheck={false}
              autoCapitalize="none"
              autoComplete="off"
              placeholder={family === "evm" ? "0x…" : family === "tron" ? "T…" : ""}
              value={sender}
              onChange={(e) => { setSender(e.target.value.trim()); setLinkErr(false); }}
              className="ac-in mono mt-2"
            />
            {sender && (senderOk
              ? <p className="ac-help flex items-center gap-1.5"><Check className="h-3.5 w-3.5" strokeWidth={2.4} /> {t("sell.senderOk")}</p>
              : <p className="ac-note">{`${t("sell.senderBad")} ${network?.tag ?? ""}.`}</p>)}
            {linkErr && <p className="ac-note">{connector ? t("sell.connectFailed") : t("sell.noWallet")}</p>}
            {connector && "openUrl" in connector && <p className="ac-help">{t("sell.openInHelp")}</p>}
            {/* Carnet d'adresses par réseau, le même que pour les achats : une adresse enregistrée sur BEP20 ne s'affiche que sur BEP20. */}
            <RecipientBook kind="wallet" network={net} value={sender} onPick={setSender} />
          </>
        )}

        {err && <p className="ac-note">{err}</p>}

        {next(openSale, !senderOk || saving)}
      </AppShell>
    );
  }

  if (step === "deposit") {
    return (
      <AppShell header={<StepHeader title={t("sell.sendUsdt")} sub={t("sell.sendUsdtSub")} />}>
        {/* Le QR garde son fond blanc : les appareils photo le lisent mieux. */}
        <div className="inline-block rounded-2xl bg-white p-4">
          <QRCodeSVG value={depositAddr} size={180} level="M" />
        </div>

        <div className="mt-8 flex items-center gap-2.5">
          <img src={`/coins/${network?.id}.svg`} alt="" className="h-6 w-6 rounded-full" draggable={false} />
          <span className="ac-k">{network?.name}</span>
          <span className="ml-auto text-[12px] text-muted-foreground">{network?.tag}</span>
        </div>
        <div className="ac-lines mt-1">
          <CopyRow label={t("sell.depositAddr")} value={depositAddr} mono />
          <CopyRow label={t("sell.exactToSend")} value={`${nfUsdt.format(usdt)} USDT`} />
        </div>

        <p className="ac-note flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2} />
          <span>{t("sell.networkWarn")} <strong>{network?.tag}</strong>. {t("sell.networkWarnLoss")}</span>
        </p>

        <p className="mt-5 text-[14px] text-muted-foreground">
          {t("sell.afterSend")}{" "}
          <span className="font-semibold text-foreground">{nfCad.format(cad)} CAD</span> {t("sell.afterSend2")}
        </p>

        {err && <p className="ac-note">{err}</p>}

        <Actions>
          <Action disabled={saving} onClick={submit}>{t("sell.iSent")}</Action>
          <Action quiet disabled={saving} onClick={cancelSale}>{t("sell.cancelSell")}</Action>
        </Actions>
      </AppShell>
    );
  }

  return (
    <AppShell header={<StepHeader title={t("sell.sentTitle")} sub={t("sell.sentSub")} />}>
      <p className="mb-6 flex items-start gap-2.5 text-[14px] leading-relaxed text-muted-foreground">
        <Check className="mt-0.5 h-4 w-4 shrink-0 text-foreground" strokeWidth={2.4} />
        <span>
          {t("sell.checking")}{" "}
          <span className="font-semibold text-foreground">{nfCad.format(cad)} CAD</span> {t("sell.checking2")}
        </span>
      </p>

      <Facts rows={[
        { label: t("sell.youSend"), value: `${nfUsdt.format(usdt)} USDT`, usdt: true },
        { label: t("sell.youReceive"), value: `${nfCad.format(cad)} CAD` },
        { label: t("sell.network"), value: network ? `${network.name} · ${network.tag}` : "N/D" },
        { label: t("sell.rate"), value: `1 USDT = ${nfCad.format(sellRate)} CAD` },
        { label: t("sell.receivedByInterac"), value: email, mono: true },
        { label: t("sell.sentFrom"), value: short(sender), mono: true },
      ]} />

      <p className="ac-k mt-10">{t("sell.orderDetail")}</p>
      <div className="ac-lines mt-1">
        <CopyRow label={t("sell.amountSent")} value={`${nfUsdt.format(usdt)} USDT`} />
        <CopyRow label={t("sell.orderRef")} value={savedRef} mono />
      </div>

      <Actions>
        <Action to="/app">{t("sell.done")}</Action>
        <Action quiet onClick={resetAll}>{t("sell.newOrder")}</Action>
      </Actions>
    </AppShell>
  );
};

export default AppVendre;
