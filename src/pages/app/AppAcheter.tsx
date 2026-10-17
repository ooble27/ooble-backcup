import { useEffect, useState } from "react";
import { useAppSettings } from "@/lib/settings";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import AppShell from "@/components/app/AppShell";
import CopyRow from "@/components/app/CopyRow";
import RecipientBook from "@/components/app/RecipientBook";
import { Action, Actions, AmountField, ClosedPage, Facts, NetworkPick, StepHeader } from "@/components/app/Flat";
import { NETWORKS, openNetworks, type NetId } from "@/components/app/networks";
import { useUsdtRate } from "@/hooks/useUsdtRate";
import { createOrder, getAllowance, orderRef, peekAllowance, type TradeAllowance } from "@/lib/orders";
import { amountText, parseAmount, toCad, toUsdt, type Unit } from "@/lib/tradeAmounts";
import { sendEmail, notifyStaffOfNewOrder } from "@/lib/email";
import { useAuth } from "@/lib/auth";
import { getLang, useT } from "@/lib/i18n";
import { STAFF_TEST_MIN_CAD } from "@/lib/config";
import { useOtcVisible } from "@/lib/otc";

type Step = "amount" | "network" | "address" | "recap" | "done";
const nfCad = new Intl.NumberFormat("fr-CA", { maximumFractionDigits: 2, minimumFractionDigits: 2 });
const nfUsdt = new Intl.NumberFormat("fr-CA", { maximumFractionDigits: 2 });
const short = (a: string) => (a.length > 16 ? `${a.slice(0, 8)}…${a.slice(-6)}` : a);

/* Commandes fermées aux clients : la page d'attente. Composant à part, pour que les rôles de
   l'équipe, chargés après le premier affichage, ne changent jamais le nombre de hooks du formulaire. */
const AppAcheter = () => {
  const { isStaff, rolesLoading } = useAuth();
  const { tradingEnabled } = useAppSettings();
  const t = useT();
  if (!tradingEnabled && !isStaff) {
    if (rolesLoading) return null;
    return <ClosedPage title={t("buy.title")} message={t("buy.comingSoonMsg")} />;
  }
  return <AppAcheterForm />;
};

const AppAcheterForm = () => {
  const rate = useUsdtRate();
  const { user, isStaff } = useAuth();
  const { tradeMinCad, tradeDailyMaxCad, networks, interacEmail, buyExpiryMinutes } = useAppSettings();
  const t = useT();
  const otc = useOtcVisible();


  const [step, setStep] = useState<Step>("amount");
  const [unit, setUnit] = useState<Unit>("CAD");
  const [amount, setAmount] = useState("");
  const [net, setNet] = useState<NetId | null>(null);
  const [address, setAddress] = useState("");
  const [savedRef, setSavedRef] = useState("");
  // Heure limite de paiement : sans virement reçu d'ici là, l'achat est annulé automatiquement.
  const [payBy, setPayBy] = useState<Date | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Limites : 100 $ minimum, 9 999 $ au total sur 24 heures (même règle
  // en base). Même taux quel que soit le montant.
  const [allowance, setAllowance] = useState<TradeAllowance | null>(() => peekAllowance(user?.id, "buy") ?? null);
  useEffect(() => { getAllowance("buy").then(setAllowance); }, []);
  const maxCad = Math.floor(Math.min(tradeDailyMaxCad, allowance?.remaining ?? tradeDailyMaxCad));
  // L'équipe peut faire de petits achats de test (dès 2 $).
  const minCad = isStaff ? STAFF_TEST_MIN_CAD : tradeMinCad;
  const blocked = allowance !== null && maxCad < minCad;

  const buyRate = rate.buy;
  const value = parseAmount(amount);
  const cad = toCad(value, unit, buyRate);
  const usdt = toUsdt(value, unit, buyRate);
  const belowMin = value > 0 && cad < minCad;
  const network = NETWORKS.find((n) => n.id === net) ?? null;

  const maxText = (u: Unit) => amountText(maxCad, u, buyRate, "max");
  const minText = (u: Unit) => amountText(minCad, u, buyRate, "min");

  // Au-delà du maximum permis, la saisie est ramenée au maximum.
  const onAmount = (raw: string) => {
    const clean = raw.replace(/[^\d.,]/g, "");
    if (toCad(parseAmount(clean), unit, buyRate) > maxCad) setAmount(maxText(unit));
    else setAmount(clean);
  };

  const setPreset = (kind: "min" | "max") => setAmount(kind === "min" ? minText(unit) : maxText(unit));

  const nextAtText = allowance?.nextAt
    ? allowance.nextAt.toLocaleString("fr-CA", {
        hour: "2-digit", minute: "2-digit",
        ...(allowance.nextAt.toDateString() !== new Date().toDateString() ? { day: "numeric", month: "long" } : {}),
      })
    : "";

  const submit = async () => {
    if (saving) return;
    setSaving(true);
    setErr(null);
    const res = await createOrder({
      side: "buy",
      cad,
      usdt,
      rate: buyRate,
      network: net ?? undefined,
      address,
    });
    setSaving(false);
    if ("error" in res) {
      setErr(res.error);
      return;
    }
    const ref = orderRef(res.id);
    setSavedRef(ref);
    setPayBy(new Date(Date.now() + buyExpiryMinutes * 60_000));
    setStep("done");

    if (user?.email) {
      void sendEmail({
        to: user.email,
        template: "order-buy",
        vars: {
          ref,
          cadAmount: nfCad.format(cad),
          usdtAmount: nfUsdt.format(usdt),
          network: network ? `${network.name} · ${network.tag}` : "N/D",
          receptionAddress: address,
          orderUrl: `${window.location.origin}/app`,
        },
      });
    }
    // Prévient le staff (best-effort, silencieux si la config manque).
    void notifyStaffOfNewOrder({
      ref,
      side: "buy",
      cadAmount: nfCad.format(cad),
      usdtAmount: nfUsdt.format(usdt),
      network: network ? `${network.name} · ${network.tag}` : "N/D",
      address,
      clientEmail: user?.email ?? "",
      clientName: user?.name ?? "",
      adminUrl: `${window.location.origin}/admin`,
    });
  };

  const next = (go: () => void, disabled: boolean) => (
    <Actions><Action disabled={disabled} onClick={go}>{t("buy.continue")}</Action></Actions>
  );

  if (step === "amount") {
    return (
      <AppShell center>
        <StepHeader title={t("buy.title")} sub={t("buy.sub")} />
        <AmountField label={t("buy.amount")} units={["CAD", "USDT"] as Unit[]} unit={unit} onUnit={(u) => { setUnit(u); setAmount(""); }}
          value={amount} onChange={onAmount} disabled={blocked} onMin={() => setPreset("min")} onMax={() => setPreset("max")}>
          {blocked ? (
            <p className="ac-note">{t("buy.limitReached").replace("{time}", nextAtText)}</p>
          ) : belowMin ? (
            <p className="ac-note">{t("buy.minHint")}</p>
          ) : null}
          {otc && (blocked || (value > 0 && cad >= maxCad)) && (
            <Link to="/app/otc" className="ac-link mt-3">{t("trade.otcHint")} <ArrowRight className="h-3.5 w-3.5" /></Link>
          )}
        </AmountField>

        <div className="mt-6">
          <Facts rows={[
            { label: unit === "CAD" ? t("buy.youReceive") : t("buy.youPay"), value: unit === "CAD" ? `${nfUsdt.format(usdt)} USDT` : `${nfCad.format(cad)} CAD`, usdt: unit === "CAD" },
            { label: t("buy.rate"), value: `1 USDT = ${nfCad.format(buyRate)} CAD` },
          ]} />
        </div>

        {next(() => setStep("network"), value <= 0 || belowMin || blocked)}
      </AppShell>
    );
  }

  if (step === "network") {
    return (
      <AppShell center>
        <StepHeader title={t("buy.dest")} sub={t("buy.destSub")} onBack={() => setStep("amount")} />
        <NetworkPick list={openNetworks(networks, "buy")} value={net} onPick={(id) => { if (id !== net) setAddress(""); setNet(id); }} />
        {next(() => setStep("address"), !net)}
      </AppShell>
    );
  }

  if (step === "address") {
    return (
      <AppShell center>
        <StepHeader title={t("buy.recvAddr")} sub={`${t("buy.yourAddr")} ${network?.tag}`} onBack={() => setStep("network")} />
        <div className="flex items-center gap-2.5">
          <img src={`/coins/${network?.id}.svg`} alt="" className="h-6 w-6 rounded-full" draggable={false} />
          <span className="ac-k">{network?.name}</span>
          <span className="ml-auto text-[12px] text-muted-foreground">{network?.tag}</span>
        </div>
        <input
          type="text"
          spellCheck={false}
          autoCapitalize="none"
          aria-label={`${t("buy.yourAddr")} ${network?.tag}`}
          placeholder={`${t("buy.yourAddr")} ${network?.tag}`}
          value={address}
          onChange={(e) => setAddress(e.target.value.trim())}
          className="ac-in mono mt-2"
        />

        <RecipientBook kind="wallet" network={net} value={address} onPick={setAddress} />

        {next(() => setStep("recap"), address.length < 12)}
      </AppShell>
    );
  }

  if (step === "recap") {
    return (
      <AppShell center>
        <StepHeader title={t("buy.recap")} sub={t("buy.recapSub")} onBack={() => setStep("address")} />
        <Facts rows={[
          { label: t("buy.youPay"), value: `${nfCad.format(cad)} CAD` },
          { label: t("buy.youReceive"), value: `${nfUsdt.format(usdt)} USDT`, usdt: true },
          { label: t("buy.rate"), value: `1 USDT = ${nfCad.format(buyRate)} CAD` },
          { label: t("buy.network"), value: `${network?.name} · ${network?.tag}` },
          { label: t("buy.address"), value: short(address), mono: true },
        ]} />

        {err && <p className="ac-note">{err}</p>}

        <Actions><Action disabled={saving} onClick={submit}>{t("buy.validate")}</Action></Actions>
      </AppShell>
    );
  }

  return (
    <AppShell header={<StepHeader title={t("buy.created")} sub={t("buy.payInterac")} />}>
      <Facts rows={[
        { label: t("buy.youReceive"), value: `${nfUsdt.format(usdt)} USDT`, usdt: true },
        { label: t("buy.toPay"), value: `${nfCad.format(cad)} CAD` },
        { label: t("buy.network"), value: `${network?.name} · ${network?.tag}` },
        { label: t("buy.address"), value: short(address), mono: true },
      ]} />

      <p className="ac-k mt-10">{t("buy.sendEtransfer")}</p>
      <div className="ac-lines mt-2">
        <CopyRow flat label={t("buy.recipient")} value={interacEmail} mono />
        <CopyRow flat label={t("buy.exactAmount")} value={`${nfCad.format(cad)} CAD`} />
        <CopyRow flat label={t("buy.reference")} value={savedRef} mono />
      </div>
      {payBy && (
        <p className="ac-note">
          {t("buy.payBy").replace("{time}", payBy.toLocaleTimeString(getLang() === "en" ? "en-CA" : "fr-CA", { hour: "2-digit", minute: "2-digit" }))}
        </p>
      )}
      <p className="ac-help">
        {t("buy.autoNote")}{" "}
        <Link to="/faq/payer-par-interac#regles-interac" className="font-medium text-foreground underline underline-offset-2">{t("buy.rulesLink")}</Link>
      </p>

      <Actions>
        <Action to="/app">{t("buy.done")}</Action>
        <Action quiet onClick={() => { setStep("amount"); setAmount(""); setNet(null); setAddress(""); setSavedRef(""); setErr(null); }}>{t("buy.newOrder")}</Action>
      </Actions>
    </AppShell>
  );
};

export default AppAcheter;
