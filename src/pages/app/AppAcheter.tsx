import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ArrowRight, Coins, Check, ShieldOff } from "lucide-react";
import AppShell from "@/components/app/AppShell";
import CopyRow from "@/components/app/CopyRow";
import RecipientBook from "@/components/app/RecipientBook";
import { NETWORKS, ORDER_NETWORKS, type NetId } from "@/components/app/networks";
import { Button } from "@/components/ui/button";
import { useUsdtRate } from "@/hooks/useUsdtRate";
import { createOrder, getAllowance, orderRef, peekAllowance, type TradeAllowance } from "@/lib/orders";
import { amountText, parseAmount, toCad, toUsdt, type Unit } from "@/lib/tradeAmounts";
import { sendEmail, notifyStaffOfNewOrder } from "@/lib/email";
import { useAuth } from "@/lib/auth";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { OOBLE_INTERAC_EMAIL, STAFF_TEST_MIN_CAD, TRADE_DAILY_MAX_CAD, TRADE_MIN_CAD, TRADING_ENABLED } from "@/lib/config";
import { useOtcVisible } from "@/lib/otc";

type Step = "amount" | "network" | "address" | "recap" | "done";
const nfCad = new Intl.NumberFormat("fr-CA", { maximumFractionDigits: 2, minimumFractionDigits: 2 });
const nfUsdt = new Intl.NumberFormat("fr-CA", { maximumFractionDigits: 2 });
const short = (a: string) => (a.length > 16 ? `${a.slice(0, 8)}…${a.slice(-6)}` : a);

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
const AppAcheter = () => {
  const { isStaff, rolesLoading } = useAuth();
  const t = useT();
  if (!TRADING_ENABLED && !isStaff) {
    if (rolesLoading) return null;
    return (
      <AppShell center>
        <div className="flex flex-col items-center py-16 text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-secondary text-muted-foreground">
            <ShieldOff className="h-7 w-7" strokeWidth={1.5} />
          </span>
          <h1 className="mt-5 font-display text-[20px] font-semibold tracking-tight">
            {t("buy.title")}
          </h1>
          <p className="mt-2 max-w-xs text-[14px] leading-relaxed text-muted-foreground">
            {t("buy.comingSoonMsg")}
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
  return <AppAcheterForm />;
};

const AppAcheterForm = () => {
  const rate = useUsdtRate();
  const { user, isStaff } = useAuth();
  const t = useT();
  const otc = useOtcVisible();


  const [step, setStep] = useState<Step>("amount");
  const [unit, setUnit] = useState<Unit>("CAD");
  const [amount, setAmount] = useState("");
  const [net, setNet] = useState<NetId | null>(null);
  const [address, setAddress] = useState("");
  const [savedRef, setSavedRef] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Limites : 100 $ minimum, 9 999 $ au total sur 24 heures (même règle
  // en base). Même taux quel que soit le montant.
  const [allowance, setAllowance] = useState<TradeAllowance | null>(() => peekAllowance(user?.id, "buy") ?? null);
  useEffect(() => { getAllowance("buy").then(setAllowance); }, []);
  const maxCad = Math.floor(Math.min(TRADE_DAILY_MAX_CAD, allowance?.remaining ?? TRADE_DAILY_MAX_CAD));
  // L'équipe peut faire de petits achats de test (dès 2 $).
  const minCad = isStaff ? STAFF_TEST_MIN_CAD : TRADE_MIN_CAD;
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

  if (step === "amount") {
    return (
      <AppShell center>
        <div className="mb-5">
          <h1 className="font-display text-[22px] font-semibold tracking-tight">{t("buy.title")}</h1>
          <p className="mt-1 text-[13px] text-muted-foreground">{t("buy.sub")}</p>
        </div>
        <div className="rounded-[20px] border border-border bg-card p-5">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{t("buy.amount")}</span>
            <div className="flex items-center gap-3">
              <div className="inline-flex gap-0.5 rounded-[10px] bg-secondary/70 p-[3px]">
                {(["CAD", "USDT"] as Unit[]).map((u) => (
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
              <div className="flex gap-2">
                <button type="button" onClick={() => setPreset("min")} className="text-[11px] font-medium text-muted-foreground underline">Min</button>
                <button type="button" onClick={() => setPreset("max")} className="text-[11px] font-medium text-muted-foreground underline">Max</button>
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
              {t("buy.limitReached").replace("{time}", nextAtText)}
            </p>
          ) : belowMin ? (
            <p className="mt-3 text-[13px] text-destructive">{t("buy.minHint")}</p>
          ) : null}
          {otc && (blocked || (value > 0 && cad >= maxCad)) && (
            <Link to="/app/otc" className="mt-3 inline-flex items-center gap-1 text-[13px] font-medium text-foreground underline-offset-2 hover:underline">
              {t("trade.otcHint")} <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          )}
        </div>

        <div className="mt-3 flex flex-col gap-2.5 rounded-[16px] border border-border bg-card px-5 py-4">
          <div className="flex items-center justify-between">
            <span className="text-[13px] text-muted-foreground">{unit === "CAD" ? t("buy.youReceive") : t("buy.youPay")}</span>
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-semibold">{unit === "CAD" ? `${nfUsdt.format(usdt)} USDT` : `${nfCad.format(cad)} CAD`}</span>
              {unit === "CAD" && <img src="/coins/usdt.svg" alt="" className="h-[18px] w-[18px]" />}
            </div>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[13px] text-muted-foreground">{t("buy.rate")}</span>
            <span className="text-[13px] text-muted-foreground">1 USDT = {nfCad.format(buyRate)} CAD</span>
          </div>
        </div>

        <div className="mt-3 flex justify-end">
          <Button variant="appPrimary" shape="soft" className="h-auto gap-2 px-[22px] py-[13px] text-sm" disabled={value <= 0 || belowMin || blocked} onClick={() => setStep("network")}>
            <Coins className="h-[17px] w-[17px]" strokeWidth={2} /> {t("buy.continue")}
          </Button>
        </div>
      </AppShell>
    );
  }

  if (step === "network") {
    return (
      <AppShell center>
        <StepHeader title={t("buy.dest")} sub={t("buy.destSub")} onBack={() => setStep("amount")} backLabel={t("misc.back")} />
        <div className="flex flex-wrap gap-2">
          {ORDER_NETWORKS.map((n) => {
            const sel = net === n.id;
            return (
              <button
                key={n.id}
                type="button"
                onClick={() => {
                  if (n.id !== net) setAddress("");
                  setNet(n.id);
                }}
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

        <div className="mt-6 flex justify-end">
          <Button variant="appPrimary" shape="soft" className="h-auto gap-2 px-[22px] py-[13px] text-sm" disabled={!net} onClick={() => setStep("address")}>
            <Coins className="h-[17px] w-[17px]" strokeWidth={2} /> {t("buy.continue")}
          </Button>
        </div>
      </AppShell>
    );
  }

  if (step === "address") {
    return (
      <AppShell center>
        <StepHeader title={t("buy.recvAddr")} sub={`${t("buy.yourAddr")} ${network?.tag}`} onBack={() => setStep("network")} backLabel={t("misc.back")} />
        <div className="overflow-hidden rounded-[14px] border border-border bg-card">
          <div className="flex items-center gap-2.5 border-b border-border px-4 py-2.5">
            <img src={`/coins/${network?.id}.svg`} alt="" className="h-[26px] w-[26px] rounded-full" draggable={false} />
            <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{network?.name}</span>
            <span className="ml-auto text-[11px] font-medium text-muted-foreground">{network?.tag}</span>
          </div>
          <input
            type="text"
            spellCheck={false}
            autoCapitalize="none"
            placeholder={`${t("buy.yourAddr")} ${network?.tag}`}
            value={address}
            onChange={(e) => setAddress(e.target.value.trim())}
            className="w-full bg-transparent px-4 py-4 font-mono text-base leading-relaxed outline-none placeholder:text-muted-foreground/60"
          />
        </div>

        <RecipientBook kind="wallet" network={net} value={address} onPick={setAddress} />

        <div className="mt-6 flex justify-end">
          <Button variant="appPrimary" shape="soft" className="h-auto gap-2 px-[22px] py-[13px] text-sm" disabled={address.length < 12} onClick={() => setStep("recap")}>
            <Coins className="h-[17px] w-[17px]" strokeWidth={2} /> {t("buy.continue")}
          </Button>
        </div>
      </AppShell>
    );
  }

  if (step === "recap") {
    return (
      <AppShell center>
        <StepHeader title={t("buy.recap")} sub={t("buy.recapSub")} onBack={() => setStep("address")} backLabel={t("misc.back")} />
        <div className="overflow-hidden rounded-[16px] border border-border bg-card">
          {[
            { label: t("buy.youPay"), value: `${nfCad.format(cad)} CAD` },
            { label: t("buy.youReceive"), value: `${nfUsdt.format(usdt)} USDT` },
            { label: t("buy.rate"), value: `1 USDT = ${nfCad.format(buyRate)} CAD` },
            { label: t("buy.network"), value: `${network?.name} · ${network?.tag}` },
            { label: t("buy.address"), value: short(address), mono: true },
          ].map((r, i, arr) => (
            <div key={r.label} className={cn("flex items-center justify-between px-4 py-[14px]", i < arr.length - 1 && "border-b border-border")}>
              <span className="text-[13px] text-muted-foreground">{r.label}</span>
              <span className={cn("max-w-[60%] break-all text-right text-[13px] font-medium", r.mono && "font-mono text-[11px]")}>{r.value}</span>
            </div>
          ))}
        </div>

        {err && <p className="mt-3 text-[13px] text-destructive">{err}</p>}

        <div className="mt-6 flex justify-end">
          <Button variant="appPrimary" shape="soft" className="h-auto gap-2 px-[22px] py-[13px] text-sm" disabled={saving} onClick={submit}>
            <Check className="h-[17px] w-[17px]" strokeWidth={2} /> {saving ? t("buy.validating") : t("buy.validate")}
          </Button>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell header={<StepHeader title={t("buy.created")} sub={t("buy.payInterac")} />}>
      <div className="overflow-hidden rounded-[16px] border border-border bg-card">
        {[
          { label: t("buy.youReceive"), value: `${nfUsdt.format(usdt)} USDT` },
          { label: t("buy.toPay"), value: `${nfCad.format(cad)} CAD` },
          { label: t("buy.network"), value: `${network?.name} · ${network?.tag}` },
          { label: t("buy.address"), value: short(address), mono: true },
        ].map((r, i, arr) => (
          <div key={r.label} className={cn("flex items-center justify-between px-4 py-[14px]", i < arr.length - 1 && "border-b border-border")}>
            <span className="text-[13px] text-muted-foreground">{r.label}</span>
            <span className={cn("max-w-[60%] break-all text-right text-[13px] font-medium", r.mono && "font-mono text-[11px]")}>{r.value}</span>
          </div>
        ))}
      </div>

      <p className="mb-2 mt-5 px-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{t("buy.sendEtransfer")}</p>
      <div className="divide-y divide-border overflow-hidden rounded-[16px] border border-border bg-card">
        <CopyRow label={t("buy.recipient")} value={OOBLE_INTERAC_EMAIL} mono />
        <CopyRow label={t("buy.exactAmount")} value={`${nfCad.format(cad)} CAD`} />
        <CopyRow label={t("buy.reference")} value={savedRef} mono />
      </div>
      <p className="mt-3 px-1 text-[12.5px] leading-relaxed text-muted-foreground">
        {t("buy.autoNote")}{" "}
        <Link to="/faq/payer-par-interac#regles-interac" className="font-medium text-foreground underline underline-offset-2">{t("buy.rulesLink")}</Link>
      </p>

      <div className="mt-6 flex justify-end gap-2.5">
        <Button variant="ghost" shape="soft" className="h-auto px-[22px] py-[13px] text-sm" onClick={() => { setStep("amount"); setAmount(""); setNet(null); setAddress(""); setSavedRef(""); setErr(null); }}>
          {t("buy.newOrder")}
        </Button>
        <Button variant="appPrimary" shape="soft" className="h-auto gap-2 px-[22px] py-[13px] text-sm" asChild>
          <Link to="/app"><Check className="h-[17px] w-[17px]" strokeWidth={2} /> {t("buy.done")}</Link>
        </Button>
      </div>
    </AppShell>
  );
};

export default AppAcheter;
