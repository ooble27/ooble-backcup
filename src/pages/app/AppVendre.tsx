import { useEffect, useState } from "react";
import { useAppSettings } from "@/lib/settings";
import { Link } from "react-router-dom";
import { ArrowLeft, ArrowRight, HandCoins, Check, Mail, AlertTriangle, MessageSquare, ShieldOff } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import AppShell from "@/components/app/AppShell";
import CopyRow from "@/components/app/CopyRow";
import RecipientBook from "@/components/app/RecipientBook";
import { Button } from "@/components/ui/button";
import { NETWORKS, ORDER_NETWORKS, type NetId } from "@/components/app/networks";
import { useUsdtRate } from "@/hooks/useUsdtRate";
import { createOrder, getAllowance, orderRef, peekAllowance, type TradeAllowance } from "@/lib/orders";
import { amountText, parseAmount, toCad, toUsdt, type Unit } from "@/lib/tradeAmounts";
import { sendEmail, notifyStaffOfNewOrder } from "@/lib/email";
import { getMyProfile, peekMyProfile } from "@/lib/profile";
import { useAuth } from "@/lib/auth";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { useOtcVisible } from "@/lib/otc";

type Step = "amount" | "reception" | "network" | "deposit" | "done";

/**
 * Adresses de dépôt des ventes. Réseaux EVM : le portefeuille MetaMask d'Ooble
 * (le même que celui d'envoi des achats : les USDT vendus servent aux achats).
 * Tron et Solana : même compte MetaMask. Mêmes valeurs dans
 * supabase/functions/sell-watch (lecture des dépôts, sauf Solana).
 */
const OOBLE_EVM = "0x0aC6f6202Ebff35D36A2Dca04C4f556FF95Fc093";
const OOBLE_DEPOSIT: Record<NetId, string> = {
  trx: "TPf6rXmbeRzueBB7SM19vQ4wDz2fcrEtAs",
  bnb: OOBLE_EVM,
  eth: OOBLE_EVM,
  matic: OOBLE_EVM,
  sol: "BKLnZeaEccUbBSR2WjBQ1j9arjBy82m9fZXRoH3w3M2i",
  avax: OOBLE_EVM,
};

const nfCad = new Intl.NumberFormat("fr-CA", { maximumFractionDigits: 2, minimumFractionDigits: 2 });
const nfUsdt = new Intl.NumberFormat("fr-CA", { maximumFractionDigits: 2 });

const StepHeader = ({ title, sub, onBack, backLabel }: { title: string; sub: string; onBack?: () => void; backLabel?: string }) => (
  <div className="mb-4 flex items-start gap-3">
    {onBack && (
      <button
        type="button"
        onClick={onBack}
        aria-label={backLabel ?? "Back"}
        className="mt-0.5 flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full bg-secondary text-foreground transition-colors hover:bg-secondary/70 active:scale-95"
      >
        <ArrowLeft className="h-[18px] w-[18px]" />
      </button>
    )}
    <div>
      <h1 className="font-display text-[18px] font-semibold tracking-tight">{title}</h1>
      <p className="mt-1 text-[13px] text-muted-foreground">{sub}</p>
    </div>
  </div>
);

/* Commandes fermées aux clients : la page d'attente. Composant à part, pour que les rôles de
   l'équipe, chargés après le premier affichage, ne changent jamais le nombre de hooks du formulaire. */
const AppVendre = () => {
  const { isStaff, rolesLoading } = useAuth();
  const { tradingEnabled } = useAppSettings();
  const t = useT();
  if (!tradingEnabled && !isStaff) {
    if (rolesLoading) return null;
    return (
      <AppShell center>
        <div className="flex flex-col items-center py-16 text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-secondary text-muted-foreground">
            <ShieldOff className="h-7 w-7" strokeWidth={1.5} />
          </span>
          <h1 className="mt-5 font-display text-[20px] font-semibold tracking-tight">
            {t("sell.title")}
          </h1>
          <p className="mt-2 max-w-xs text-[14px] leading-relaxed text-muted-foreground">
            {t("sell.comingSoonMsg")}
          </p>
          <Link
            to="/app"
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-secondary px-5 py-2.5 text-[13px] font-medium text-foreground transition-colors hover:bg-secondary/70"
          >
            <ArrowLeft className="h-4 w-4" />
            {t("trade.backToDash")}
          </Link>
        </div>
      </AppShell>
    );
  }
  return <AppVendreForm />;
};

const AppVendreForm = () => {
  const rate = useUsdtRate();
  const { user, isStaff } = useAuth();
  const { tradeMinCad, tradeDailyMaxCad } = useAppSettings();
  const t = useT();
  const otc = useOtcVisible();


  const [step, setStep] = useState<Step>("amount");
  const [unit, setUnit] = useState<Unit>("USDT");
  const [amount, setAmount] = useState("");
  const [email, setEmail] = useState("");
  const [net, setNet] = useState<NetId | null>(null);
  const [savedRef, setSavedRef] = useState("");
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
  const depositAddr = net ? OOBLE_DEPOSIT[net] : "";

  const submit = async () => {
    if (saving) return;
    setSaving(true);
    setErr(null);
    const res = await createOrder({
      side: "sell",
      cad,
      usdt,
      rate: sellRate,
      network: net ?? undefined,
      interacEmail: email,
    });
    setSaving(false);
    if ("error" in res) {
      setErr(res.error);
      return;
    }
    const ref = orderRef(res.id);
    setSavedRef(ref);
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

  if (step === "amount") {
    return (
      <AppShell center>
        <div className="mb-5">
          <h1 className="font-display text-[22px] font-semibold tracking-tight">{t("sell.title")}</h1>
          <p className="mt-1 text-[13px] text-muted-foreground">{t("sell.sub")}</p>
        </div>
        <div className="rounded-[20px] border border-border bg-card p-5">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{t("sell.amount")}</span>
            <div className="flex items-center gap-3">
              <div className="inline-flex gap-0.5 rounded-[10px] bg-secondary/70 p-[3px]">
                {(["USDT", "CAD"] as Unit[]).map((u) => (
                  <button
                    key={u}
                    type="button"
                    onClick={() => { setUnit(u); setAmount(""); }}
                    className={cn(
                      "rounded-[7px] px-3 py-[5px] text-xs font-semibold transition-colors",
                      unit === u ? "bg-card text-foreground dark:bg-neutral-600" : "text-muted-foreground",
                    )}
                  >
                    {u}
                  </button>
                ))}
              </div>
              <div className={isStaff ? "hidden" : "flex gap-2"}>
                <button type="button" onClick={() => setAmount(minText(unit))} className="text-[11px] font-medium text-muted-foreground underline">Min</button>
                <button type="button" onClick={() => setAmount(maxText(unit))} className="text-[11px] font-medium text-muted-foreground underline">Max</button>
              </div>
            </div>
          </div>

          <div className="relative">
            <input
              inputMode="decimal"
              placeholder="0"
              value={amount}
              onChange={(e) => onAmount(e.target.value)}
              disabled={blocked}
              className="w-full rounded-[14px] border border-border bg-secondary/40 py-[18px] pl-5 pr-[84px] text-[34px] font-bold tracking-[-1px] outline-none placeholder:text-muted-foreground/40"
            />
            <span className="absolute right-4 top-1/2 flex -translate-y-1/2 items-center gap-1.5 text-sm font-medium text-muted-foreground">
              {unit === "USDT" && <img src="/coins/usdt.svg" alt="" className="h-5 w-5" />}
              {unit}
            </span>
          </div>

          {blocked ? (
            <p className="mt-3 text-[13px] leading-relaxed text-destructive">
              {t("sell.limitReached").replace("{time}", nextAtText)}
            </p>
          ) : belowMin ? (
            <p className="mt-3 text-[13px] text-destructive">{t("sell.minHint")}</p>
          ) : null}
          {otc && !isStaff && (blocked || (value > 0 && cad >= maxCad)) && (
            <Link to="/app/otc" className="mt-3 inline-flex items-center gap-1 text-[13px] font-medium text-foreground underline-offset-2 hover:underline">
              {t("trade.otcHint")} <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          )}
        </div>

        <div className="mt-3 flex flex-col gap-2.5 rounded-[16px] border border-border bg-card px-5 py-4">
          <div className="flex items-center justify-between">
            <span className="text-[13px] text-muted-foreground">{unit === "USDT" ? t("sell.youReceive") : t("sell.youSend")}</span>
            <span className="text-sm font-semibold">{unit === "USDT" ? `${nfCad.format(cad)} CAD` : `${nfUsdt.format(usdt)} USDT`}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[13px] text-muted-foreground">{t("sell.rate")}</span>
            <span className="text-[13px] text-muted-foreground">1 USDT = {nfCad.format(sellRate)} CAD</span>
          </div>
        </div>

        <div className="mt-3 flex justify-start">
          <Button variant="appPrimary" shape="soft" className="h-auto gap-2 px-[22px] py-[13px] text-sm" disabled={value <= 0 || belowMin || blocked} onClick={() => setStep("reception")}>
            <HandCoins className="h-[17px] w-[17px]" strokeWidth={2} /> {t("sell.continue")}
          </Button>
        </div>
      </AppShell>
    );
  }

  if (step === "reception") {
    return (
      <AppShell center>
        <StepHeader title={t("sell.reception")} sub={t("sell.receptionSub")} onBack={() => setStep("amount")} backLabel={t("misc.back")} />
        <div className="overflow-hidden rounded-[14px] border border-border bg-card">
          <div className="border-b border-border px-4 py-2.5">
            <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{t("sell.interacEmail")}</span>
          </div>
          <div className="flex items-center gap-2.5 px-4 py-4">
            <Mail className="h-5 w-5 shrink-0 text-muted-foreground" strokeWidth={1.9} />
            <input
              type="email"
              spellCheck={false}
              autoCapitalize="none"
              placeholder={t("sell.emailPh")}
              value={email}
              onChange={(e) => setEmail(e.target.value.trim())}
              className="w-full bg-transparent text-base outline-none placeholder:text-muted-foreground/60"
            />
          </div>
        </div>
        <RecipientBook kind="interac" value={email} onPick={setEmail} />

        <p className="mt-3 px-1 text-[13px] text-muted-foreground">
          <span className="font-semibold text-foreground">{nfCad.format(cad)} CAD</span> {t("sell.receiveInfo")}
        </p>

        {interacQA && (
          <div className="mt-4 overflow-hidden rounded-[14px] border border-border bg-card">
            <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
              <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={2} />
              <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{t("sell.securityQ")}</span>
            </div>
            <CopyRow label={t("sell.question")} value={interacQA.q} />
            <CopyRow label={t("sell.answerToEnter")} value={interacQA.a} mono />
          </div>
        )}
        <p className="mt-2 px-1 text-[12px] text-muted-foreground">
          {t("sell.unlockHelp")}
        </p>

        <div className="mt-5 flex justify-start">
          <Button variant="appPrimary" shape="soft" className="h-auto gap-2 px-[22px] py-[13px] text-sm" disabled={!/^\S+@\S+\.\S+$/.test(email)} onClick={() => setStep("network")}>
            <HandCoins className="h-[17px] w-[17px]" strokeWidth={2} /> {t("sell.continue")}
          </Button>
        </div>
      </AppShell>
    );
  }

  if (step === "network") {
    return (
      <AppShell center>
        <StepHeader title={t("sell.network")} sub={t("sell.networkSub")} onBack={() => setStep("reception")} backLabel={t("misc.back")} />
        <div className="flex flex-wrap gap-2">
          {ORDER_NETWORKS.map((n) => {
            const sel = net === n.id;
            return (
              <button
                key={n.id}
                type="button"
                onClick={() => setNet(n.id)}
                className={cn(
                  "flex items-center gap-2.5 rounded-[10px] border py-2 pl-2 pr-3.5 transition-colors active:scale-[0.98]",
                  sel ? "border-foreground bg-secondary" : "border-border bg-card",
                )}
              >
                <img src={`/coins/${n.id}.svg`} alt="" className="h-7 w-7 shrink-0 rounded-full" draggable={false} />
                <span className="whitespace-nowrap text-sm">{n.name}</span>
              </button>
            );
          })}
        </div>

        <div className="mt-6 flex justify-start">
          <Button variant="appPrimary" shape="soft" className="h-auto gap-2 px-[22px] py-[13px] text-sm" disabled={!net} onClick={() => setStep("deposit")}>
            <HandCoins className="h-[17px] w-[17px]" strokeWidth={2} /> {t("sell.continue")}
          </Button>
        </div>
      </AppShell>
    );
  }

  if (step === "deposit") {
    return (
      <AppShell header={<StepHeader title={t("sell.sendUsdt")} sub={t("sell.sendUsdtSub")} onBack={() => setStep("network")} backLabel={t("misc.back")} />}>
        <div className="flex justify-center">
          <div className="rounded-2xl border border-border bg-white p-4">
            <QRCodeSVG value={depositAddr} size={180} level="M" />
          </div>
        </div>

        <div className="mt-4 overflow-hidden rounded-[14px] border border-border bg-card">
          <div className="flex items-center gap-2.5 border-b border-border px-4 py-2.5">
            <img src={`/coins/${network?.id}.svg`} alt="" className="h-[26px] w-[26px] rounded-full" draggable={false} />
            <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{network?.name}</span>
            <span className="ml-auto text-[11px] font-medium text-muted-foreground">{network?.tag}</span>
          </div>
          <CopyRow label={t("sell.depositAddr")} value={depositAddr} mono />
          <CopyRow label={t("sell.exactToSend")} value={`${nfUsdt.format(usdt)} USDT`} />
        </div>

        <div className="mt-3 flex items-start gap-2.5 rounded-[12px] border border-amber-300/60 bg-amber-50 px-4 py-3 dark:border-amber-500/30 dark:bg-amber-500/10">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" strokeWidth={2} />
          <p className="text-[12.5px] leading-snug text-amber-800 dark:text-amber-200">
            {t("sell.networkWarn")} <strong>{network?.tag}</strong>. {t("sell.networkWarnLoss")}
          </p>
        </div>

        <p className="mt-3 px-1 text-[13px] text-muted-foreground">
          {t("sell.afterSend")}{" "}
          <span className="font-semibold text-foreground">{nfCad.format(cad)} CAD</span> {t("sell.afterSend2")}
        </p>

        {err && <p className="mt-3 text-[13px] text-destructive">{err}</p>}

        <div className="mt-6 flex justify-start">
          <Button variant="appPrimary" shape="soft" className="h-auto gap-2 px-[22px] py-[13px] text-sm" disabled={saving} onClick={submit}>
            <Check className="h-[17px] w-[17px]" strokeWidth={2} /> {saving ? t("sell.saving") : t("sell.iSent")}
          </Button>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell header={<StepHeader title={t("sell.sentTitle")} sub={t("sell.sentSub")} />}>
      <div className="mb-4 flex items-start gap-2.5 rounded-[14px] border border-border bg-secondary/40 px-4 py-3.5">
        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-white">
          <Check className="h-[14px] w-[14px]" strokeWidth={2.5} />
        </span>
        <p className="text-[13px] leading-snug text-muted-foreground">
          {t("sell.checking")}{" "}
          <span className="font-semibold text-foreground">{nfCad.format(cad)} CAD</span> {t("sell.checking2")}
        </p>
      </div>

      <div className="overflow-hidden rounded-[16px] border border-border bg-card">
        {[
          { label: t("sell.youSend"), value: `${nfUsdt.format(usdt)} USDT` },
          { label: t("sell.youReceive"), value: `${nfCad.format(cad)} CAD` },
          { label: t("sell.network"), value: network ? `${network.name} · ${network.tag}` : "N/D" },
          { label: t("sell.rate"), value: `1 USDT = ${nfCad.format(sellRate)} CAD` },
          { label: t("sell.receivedByInterac"), value: email, mono: true },
        ].map((r, i, arr) => (
          <div key={r.label} className={cn("flex items-center justify-between px-4 py-[14px]", i < arr.length - 1 && "border-b border-border")}>
            <span className="text-[13px] text-muted-foreground">{r.label}</span>
            <span className={cn("max-w-[60%] break-all text-right text-[13px] font-medium", r.mono && "font-mono text-[11px]")}>{r.value}</span>
          </div>
        ))}
      </div>

      <p className="mb-2 mt-5 px-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{t("sell.orderDetail")}</p>
      <div className="divide-y divide-border overflow-hidden rounded-[16px] border border-border bg-card">
        <CopyRow label={t("sell.amountSent")} value={`${nfUsdt.format(usdt)} USDT`} />
        <CopyRow label={t("sell.orderRef")} value={savedRef} mono />
      </div>

      <div className="mt-6 flex justify-start gap-2.5">
        <Button variant="appPrimary" shape="soft" className="h-auto gap-2 px-[22px] py-[13px] text-sm" asChild>
          <Link to="/app"><Check className="h-[17px] w-[17px]" strokeWidth={2} /> {t("sell.done")}</Link>
        </Button>
        <Button variant="ghost" shape="soft" className="h-auto px-[22px] py-[13px] text-sm" onClick={() => { setStep("amount"); setAmount(""); setEmail(""); setNet(null); setSavedRef(""); setErr(null); }}>
          {t("sell.newOrder")}
        </Button>
      </div>
    </AppShell>
  );
};

export default AppVendre;
