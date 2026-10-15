import { useMemo, useState } from "react";
import { useAppSettings } from "@/lib/settings";
import { Link } from "react-router-dom";
import { ArrowLeft, Check, Handshake, ShieldOff } from "lucide-react";
import AppShell from "@/components/app/AppShell";
import CopyRow from "@/components/app/CopyRow";
import RecipientBook from "@/components/app/RecipientBook";
import { NETWORKS, ORDER_NETWORKS, type NetId } from "@/components/app/networks";
import { Button } from "@/components/ui/button";
import { useUsdtRate } from "@/hooks/useUsdtRate";
import { useAuth } from "@/lib/auth";
import { OOBLE_OTC_EMAIL } from "@/lib/config";
import { getMyProfile } from "@/lib/profile";
import { T, useLang, useT } from "@/lib/i18n";
import { parseAmount, toCad, toUsdt, type Unit } from "@/lib/tradeAmounts";
import { supabase } from "@/integrations/supabase/client";
import { t as tr, type TKey } from "@/lib/translations";
import { cn } from "@/lib/utils";

/* Desk OTC : demande de prix pour un achat ou une vente de 10 000 $ et plus.
   Même parcours qu'Acheter / Vendre : montant → réseau → origine des fonds →
   récapitulatif. La demande arrive dans la boîte otc@ooble.ca (Admin →
   Messagerie, pastille « OTC ») ; le desk répond avec un prix ferme.
   Réservé à l'équipe Ooble tant que le bureau OTC n'est pas ouvert dans Réglages. */

type Side = "buy" | "sell";
type Step = "amount" | "network" | "funds" | "recap" | "done";

/** En dessous, l'application suffit (limite de 9 999 $ sur 24 heures). */
const OTC_MIN_CAD = 10_000;

const USAGE_KEYS: TKey[] = ["otcApp.usage1", "otcApp.usage2", "otcApp.usage3", "otcApp.usage4", "otcApp.usage5"];
const SOURCE_KEYS: TKey[] = ["otcApp.source1", "otcApp.source2", "otcApp.source3", "otcApp.source4", "otcApp.source5"];

const nfCad = new Intl.NumberFormat("fr-CA", { maximumFractionDigits: 2, minimumFractionDigits: 2 });
const nfUsdt = new Intl.NumberFormat("fr-CA", { maximumFractionDigits: 2 });
const nfInt = new Intl.NumberFormat("fr-CA", { maximumFractionDigits: 0 });
const short = (a: string) => (a.length > 16 ? `${a.slice(0, 8)}…${a.slice(-6)}` : a);
const newRef = () => `OTC-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;

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

/** Choix en pastilles (usage, provenance des fonds). */
const Pills = ({ options, value, onChange }: { options: TKey[]; value: TKey | null; onChange: (k: TKey) => void }) => {
  const t = useT();
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((k) => (
        <button
          key={k}
          type="button"
          onClick={() => onChange(k)}
          aria-pressed={value === k}
          className={cn(
            "rounded-full border px-3.5 py-1.5 text-[13px] transition-colors active:scale-[0.98]",
            value === k ? "border-foreground bg-secondary text-foreground" : "border-border bg-card text-foreground/80 hover:bg-secondary/50",
          )}
        >
          {t(k)}
        </button>
      ))}
    </div>
  );
};

const Continue = ({ disabled, onClick, children }: { disabled?: boolean; onClick: () => void; children?: React.ReactNode }) => {
  const t = useT();
  return (
    <Button variant="appPrimary" shape="soft" className="h-auto gap-2 px-[22px] py-[13px] text-sm" disabled={disabled} onClick={onClick}>
      {children ?? <><Handshake className="h-[17px] w-[17px]" strokeWidth={2} /> {t("buy.continue")}</>}
    </Button>
  );
};

/** Accès : équipe Ooble seulement tant que le desk n'est pas ouvert. */
const AppOTC = () => {
  const { isStaff, rolesLoading } = useAuth();
  const { otcEnabled } = useAppSettings();
  const t = useT();
  if (otcEnabled || isStaff) return <OtcFlow />;
  if (rolesLoading) return <AppShell center>{null}</AppShell>;
  return (
    <AppShell center>
      <div className="flex flex-col items-center py-16 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-secondary text-muted-foreground">
          <ShieldOff className="h-7 w-7" strokeWidth={1.5} />
        </span>
        <h1 className="mt-5 font-display text-[20px] font-semibold tracking-tight">{t("otcApp.title")}</h1>
        <p className="mt-2 max-w-xs text-[14px] leading-relaxed text-muted-foreground">
          <T en="The OTC desk will be available soon.">Le desk OTC sera bientôt disponible.</T>
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
};

function OtcFlow() {
  const t = useT();
  const [lang] = useLang();
  const { user } = useAuth();
  const rate = useUsdtRate();

  const [step, setStep] = useState<Step>("amount");
  const [side, setSide] = useState<Side>("buy");
  const [unit, setUnit] = useState<Unit>("CAD");
  const [amount, setAmount] = useState("");
  const [net, setNet] = useState<NetId | null>(null);
  const [address, setAddress] = useState("");
  const [usage, setUsage] = useState<TKey | null>(null);
  const [source, setSource] = useState<TKey | null>(null);
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ref, setRef] = useState(newRef);

  // Taux indicatif : le desk envoie ensuite un prix ferme.
  const r = side === "buy" ? rate.buy : rate.sell;
  const value = parseAmount(amount);
  const usdt = toUsdt(value, unit, r);
  const cad = toCad(usdt, "USDT", r);
  const belowMin = value > 0 && cad < OTC_MIN_CAD;
  const network = NETWORKS.find((n) => n.id === net) ?? null;
  const sideLabel = side === "buy" ? t("otcApp.buyOf") : t("otcApp.sellOf");

  const recap: { label: string; value: string; mono?: boolean }[] = useMemo(
    () => [
      { label: t("otcApp.sideLabel"), value: sideLabel },
      { label: lang === "en" ? "Amount" : "Montant", value: `${nfCad.format(cad)} CAD` },
      { label: lang === "en" ? "Equivalent" : "Équivalent", value: `≈ ${nfUsdt.format(usdt)} USDT` },
      { label: t("buy.network"), value: network ? `${network.name} · ${network.tag}` : "N/D" },
      ...(side === "buy" ? [{ label: t("buy.address"), value: short(address), mono: true }] : []),
      { label: t("otcApp.usage"), value: usage ? t(usage) : "N/D" },
      { label: t("otcApp.source"), value: source ? t(source) : "N/D" },
    ],
    [t, lang, sideLabel, cad, usdt, network, side, address, usage, source],
  );

  const submit = async () => {
    if (sending || !usage || !source) return;
    setSending(true);
    setErr(null);
    const p = await getMyProfile();
    const company = p?.accountType === "business" ? p.businessName : null;
    const lines = [
      `Demande OTC ${ref}`,
      `Sens : ${side === "buy" ? "achat de USDT" : "vente de USDT"}`,
      `Montant : ${nfInt.format(cad)} $ CAD (≈ ${nfUsdt.format(usdt)} USDT au taux indicatif de ${nfCad.format(r)})`,
      `Réseau : ${network ? `${network.name} · ${network.tag}` : "N/D"}`,
      side === "buy" ? `Adresse de réception : ${address}` : "Adresse de dépôt : à fournir par le desk",
      `Usage : ${tr(usage, "fr")}`,
      `Origine des fonds : ${tr(source, "fr")}`,
      ...(note.trim() ? ["", "Précisions du client :", note.trim()] : []),
      "",
      `Compte : ${user?.name ?? "N/D"} <${user?.email ?? "N/D"}>`,
      company
        ? `Entreprise : ${company} (vérification : ${{ not_started: "non commencée", pending: "en attente", approved: "vérifiée", rejected: "refusée" }[p!.businessStatus]})`
        : "Compte individuel",
    ];
    const { error } = await supabase.functions.invoke("send-email", {
      body: {
        contact: {
          desk: "otc",
          name: company || user?.name || user?.email || "Client",
          email: user?.email ?? "",
          subject: `${side === "buy" ? "Achat" : "Vente"} ${nfInt.format(cad)} $ · ${ref}`,
          message: lines.join("\n"),
        },
      },
    });
    setSending(false);
    if (error) {
      const status = (error as { context?: Response }).context?.status;
      setErr(t(status === 429 ? "cont.tooMany" : "cont.error"));
      return;
    }
    setStep("done");
  };

  const reset = () => {
    setStep("amount"); setAmount(""); setNet(null); setAddress(""); setUsage(null); setSource(null);
    setNote(""); setErr(null); setRef(newRef());
  };

  const Rows = ({ rows }: { rows: typeof recap }) => (
    <div className="overflow-hidden rounded-[16px] border border-border bg-card">
      {rows.map((row, i) => (
        <div key={row.label} className={cn("flex items-center justify-between gap-4 px-4 py-[14px]", i < rows.length - 1 && "border-b border-border")}>
          <span className="text-[13px] text-muted-foreground">{row.label}</span>
          <span className={cn("max-w-[60%] break-all text-right text-[13px] font-medium", row.mono && "font-mono text-[11px]")}>{row.value}</span>
        </div>
      ))}
    </div>
  );

  if (step === "amount") {
    return (
      <AppShell center>
        <div className="mb-5">
          <h1 className="font-display text-[22px] font-semibold tracking-tight">{t("otcApp.title")}</h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            <T en="A firm price from $10,000">Un prix ferme à partir de 10 000 $</T>
          </p>
        </div>

        <div className="rounded-[20px] border border-border bg-card p-5">
          <div className="mb-5 grid grid-cols-2 gap-0.5 rounded-[12px] bg-secondary/70 p-[3px]">
            {(["buy", "sell"] as Side[]).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => { setSide(s); setNet(null); setAddress(""); }}
                aria-pressed={side === s}
                className={cn(
                  "rounded-[9px] py-2.5 text-[14px] font-semibold transition-colors",
                  side === s ? "bg-card text-foreground dark:bg-neutral-600" : "text-muted-foreground",
                )}
              >
                {s === "buy" ? t("otcApp.buyLabel") : t("otcApp.sellLabel")}
              </button>
            ))}
          </div>

          <div className="mb-3 flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{t("buy.amount")}</span>
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
          </div>

          <div className="relative">
            <input
              inputMode="decimal"
              placeholder={unit === "CAD" ? "10000" : "0"}
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ""))}
              className="w-full rounded-[14px] border border-border bg-secondary/40 py-[18px] pl-5 pr-[84px] text-[34px] font-bold tracking-[-1px] outline-none placeholder:text-muted-foreground/40"
            />
            <span className="absolute right-4 top-1/2 flex -translate-y-1/2 items-center gap-1.5 text-sm font-medium text-muted-foreground">
              {unit === "USDT" && <img src="/coins/usdt.svg" alt="" className="h-5 w-5" />}
              {unit}
            </span>
          </div>
          {belowMin && (
            <p className="mt-3 text-[13px] leading-relaxed text-destructive">
              <T en="Minimum $10,000. For less, use Buy or Sell.">Minimum 10 000 $. En dessous, utilisez Acheter ou Vendre.</T>
            </p>
          )}
        </div>

        <div className="mt-3 flex flex-col gap-2.5 rounded-[16px] border border-border bg-card px-5 py-4">
          <div className="flex items-center justify-between">
            <span className="text-[13px] text-muted-foreground"><T en="Equivalent">Équivalent</T></span>
            <span className="text-sm font-semibold">
              ≈ {unit === "CAD" ? `${nfUsdt.format(usdt)} USDT` : `${nfCad.format(cad)} CAD`}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[13px] text-muted-foreground"><T en="Indicative rate">Taux indicatif</T></span>
            <span className="text-[13px] text-muted-foreground">1 USDT = {nfCad.format(r)} CAD</span>
          </div>
          <p className="border-t border-border pt-2.5 text-[12.5px] leading-relaxed text-muted-foreground">
            <T en="The desk replies with a firm price. Nothing is committed until you accept it.">
              Le desk vous répond avec un prix ferme. Rien n'est engagé tant que vous ne l'avez pas accepté.
            </T>
          </p>
        </div>

        <div className="mt-3 flex justify-end">
          <Continue disabled={value <= 0 || belowMin} onClick={() => setStep("network")} />
        </div>
      </AppShell>
    );
  }

  if (step === "network") {
    return (
      <AppShell center>
        <StepHeader
          title={t("buy.network")}
          sub={side === "buy"
            ? (lang === "en" ? "Where to receive your USDT" : "Où recevoir vos USDT")
            : (lang === "en" ? "The network you'll send the USDT from" : "Le réseau depuis lequel vous enverrez les USDT")}
          onBack={() => setStep("amount")}
          backLabel={t("misc.back")}
        />
        <div className="flex flex-wrap gap-2">
          {ORDER_NETWORKS.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => { if (n.id !== net) setAddress(""); setNet(n.id); }}
              className={cn(
                "flex items-center gap-2.5 rounded-[10px] border py-2 pl-2 pr-3.5 transition-colors active:scale-[0.98]",
                net === n.id ? "border-foreground bg-secondary" : "border-border bg-card",
              )}
            >
              <img src={`/coins/${n.id}.svg`} alt="" className="h-7 w-7 shrink-0 rounded-full" draggable={false} />
              <span className="whitespace-nowrap text-sm">{n.name}</span>
            </button>
          ))}
        </div>

        {side === "buy" && network && (
          <>
            <div className="mt-5 overflow-hidden rounded-[14px] border border-border bg-card">
              <div className="flex items-center gap-2.5 border-b border-border px-4 py-2.5">
                <img src={`/coins/${network.id}.svg`} alt="" className="h-[26px] w-[26px] rounded-full" draggable={false} />
                <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{t("otcApp.usdtAddress")}</span>
                <span className="ml-auto text-[11px] font-medium text-muted-foreground">{network.tag}</span>
              </div>
              <input
                type="text"
                spellCheck={false}
                autoCapitalize="none"
                placeholder={`${t("buy.yourAddr")} ${network.tag}`}
                value={address}
                onChange={(e) => setAddress(e.target.value.trim())}
                className="w-full bg-transparent px-4 py-4 font-mono text-base leading-relaxed outline-none placeholder:text-muted-foreground/60"
              />
            </div>
            <RecipientBook kind="wallet" network={net} value={address} onPick={setAddress} />
          </>
        )}

        <div className="mt-6 flex justify-end">
          <Continue disabled={!net || (side === "buy" && address.length < 12)} onClick={() => setStep("funds")} />
        </div>
      </AppShell>
    );
  }

  if (step === "funds") {
    return (
      <AppShell center>
        <StepHeader
          title={t("otcApp.source")}
          sub={lang === "en" ? "Required by law for large amounts" : "Exigé par la loi pour les gros montants"}
          onBack={() => setStep("network")}
          backLabel={t("misc.back")}
        />
        <div className="rounded-[16px] border border-border bg-card">
          <div className="px-5 py-5">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{t("otcApp.usage")}</p>
            <Pills options={USAGE_KEYS} value={usage} onChange={setUsage} />
          </div>
          <div className="border-t border-border px-5 py-5">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{t("otcApp.source")}</p>
            <Pills options={SOURCE_KEYS} value={source} onChange={setSource} />
          </div>
          <div className="border-t border-border px-5 py-5">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              <T en="Details (optional)">Précisions (facultatif)</T>
            </p>
            <textarea
              rows={3}
              maxLength={1000}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={lang === "en" ? "Timing, recurring trades, questions for the desk…" : "Délai souhaité, opérations régulières, questions pour le desk…"}
              className="w-full resize-none rounded-[12px] border border-border bg-secondary/40 px-4 py-3 text-[15px] outline-none placeholder:text-muted-foreground/60 focus:border-foreground"
            />
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <Continue disabled={!usage || !source} onClick={() => setStep("recap")} />
        </div>
      </AppShell>
    );
  }

  if (step === "recap") {
    return (
      <AppShell center>
        <StepHeader
          title={t("buy.recap")}
          sub={lang === "en" ? "Check your request before sending it" : "Vérifiez votre demande avant de l'envoyer"}
          onBack={() => setStep("funds")}
          backLabel={t("misc.back")}
        />
        <Rows rows={recap} />
        <p className="mt-3 px-1 text-[12.5px] leading-relaxed text-muted-foreground">
          <T en="The desk will reply to">Le desk vous répondra à</T> <span className="font-medium text-foreground">{user?.email}</span>.
        </p>

        {err && <p className="mt-3 text-[13px] text-destructive">{err}</p>}

        <div className="mt-6 flex justify-end">
          <Continue disabled={sending} onClick={submit}>
            <Check className="h-[17px] w-[17px]" strokeWidth={2} />
            {sending ? t("cont.sending") : <T en="Send request">Envoyer la demande</T>}
          </Continue>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell header={<StepHeader title={t("otcApp.sentTitle")} sub={t("otcApp.sentSub")} />}>
      <div className="mb-5 flex items-start gap-2.5">
        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-foreground text-background">
          <Check className="h-[14px] w-[14px]" strokeWidth={2.5} />
        </span>
        <p className="text-[13px] leading-snug text-muted-foreground">
          {t("otcApp.contactAt")} <span className="font-semibold text-foreground">{user?.email}</span> {t("otcApp.contactAt2")}
        </p>
      </div>

      <Rows rows={recap.slice(0, 4)} />

      <p className="mb-2 mt-5 px-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{t("otcApp.yourRef")}</p>
      <div className="divide-y divide-border overflow-hidden rounded-[16px] border border-border bg-card">
        <CopyRow label={t("otcApp.requestRef")} value={ref} mono />
        <CopyRow label={lang === "en" ? "OTC desk" : "Desk OTC"} value={OOBLE_OTC_EMAIL} mono />
      </div>

      <div className="mt-6 flex justify-end gap-2.5">
        <Button variant="ghost" shape="soft" className="h-auto px-[22px] py-[13px] text-sm" onClick={reset}>
          <T en="New request">Nouvelle demande</T>
        </Button>
        <Button variant="appPrimary" shape="soft" className="h-auto gap-2 px-[22px] py-[13px] text-sm" asChild>
          <Link to="/app"><Check className="h-[17px] w-[17px]" strokeWidth={2} /> {t("otcApp.done")}</Link>
        </Button>
      </div>
    </AppShell>
  );
}

export default AppOTC;
