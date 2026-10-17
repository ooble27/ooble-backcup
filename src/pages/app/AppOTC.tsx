import { useMemo, useState } from "react";
import { useAppSettings } from "@/lib/settings";
import { Check } from "lucide-react";
import { useNavigate } from "react-router-dom";
import AppShell from "@/components/app/AppShell";
import CopyRow from "@/components/app/CopyRow";
import RecipientBook from "@/components/app/RecipientBook";
import { NETWORKS, openNetworks, type NetId } from "@/components/app/networks";
import { Action, Actions, AmountField, ClosedPage, Facts, NetworkPick, StepHeader } from "@/components/app/Flat";
import { useUsdtRate } from "@/hooks/useUsdtRate";
import { useAuth } from "@/lib/auth";
import { getMyProfile } from "@/lib/profile";
import { T, useLang, useT } from "@/lib/i18n";
import { parseAmount, toCad, toUsdt, type Unit } from "@/lib/tradeAmounts";
import { supabase } from "@/integrations/supabase/client";
import { t as tr, type TKey } from "@/lib/translations";

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

/** Choix en mots soulignés (usage, provenance des fonds). */
const Pills = ({ options, value, onChange }: { options: TKey[]; value: TKey | null; onChange: (k: TKey) => void }) => {
  const t = useT();
  return (
    <div className="ac-opts flex-wrap" style={{ gap: "6px 20px" }}>
      {options.map((k) => (
        <button key={k} type="button" onClick={() => onChange(k)} aria-pressed={value === k} style={{ fontSize: 15 }}>{t(k)}</button>
      ))}
    </div>
  );
};

/** Accès : équipe Ooble seulement tant que le desk n'est pas ouvert. */
const AppOTC = () => {
  const { isStaff, rolesLoading } = useAuth();
  const { otcEnabled } = useAppSettings();
  const t = useT();
  const [lang] = useLang();
  if (otcEnabled || isStaff) return <OtcFlow />;
  if (rolesLoading) return <AppShell center>{null}</AppShell>;
  return <ClosedPage title={t("otcApp.title")} message={lang === "en" ? "The OTC desk will be available soon." : "Le desk OTC sera bientôt disponible."} />;
};

function OtcFlow() {
  const t = useT();
  const navigate = useNavigate();
  // Ouvert depuis Mon compte, Acheter ou Vendre : on revient d'où l'on vient (sinon, à l'accueil).
  const goBack = () => (window.history.length > 1 ? navigate(-1) : navigate("/app"));
  const { networks, otcEmail } = useAppSettings();
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

  const recap: { label: string; value: string; mono?: boolean; usdt?: boolean }[] = useMemo(
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

  const next = (go: () => void, disabled: boolean) => (
    <Actions><Action disabled={disabled} onClick={go}>{t("buy.continue")}</Action></Actions>
  );

  if (step === "amount") {
    return (
      <AppShell center>
        <StepHeader title={t("otcApp.title")} sub={lang === "en" ? "A firm price from $10,000" : "Un prix ferme à partir de 10 000 $"} onBack={goBack} />

        <div className="ac-opts mb-8" role="group" aria-label={t("otcApp.sideLabel")} style={{ gap: 24 }}>
          {(["buy", "sell"] as Side[]).map((sd) => (
            <button key={sd} type="button" aria-pressed={side === sd} onClick={() => { setSide(sd); setNet(null); setAddress(""); }} style={{ fontSize: 18, fontWeight: 600 }}>
              {sd === "buy" ? t("otcApp.buyLabel") : t("otcApp.sellLabel")}
            </button>
          ))}
        </div>

        <AmountField label={t("buy.amount")} units={["CAD", "USDT"] as Unit[]} unit={unit} onUnit={(u) => { setUnit(u); setAmount(""); }}
          value={amount} onChange={(v) => setAmount(v.replace(/[^\d.,]/g, ""))}>
          {belowMin && (
            <p className="ac-note">
              <T en="Minimum $10,000. For less, use Buy or Sell.">Minimum 10 000 $. En dessous, utilisez Acheter ou Vendre.</T>
            </p>
          )}
        </AmountField>

        <div className="mt-6">
          <Facts rows={[
            { label: lang === "en" ? "Equivalent" : "Équivalent", value: `≈ ${unit === "CAD" ? `${nfUsdt.format(usdt)} USDT` : `${nfCad.format(cad)} CAD`}`, usdt: unit === "CAD" },
            { label: lang === "en" ? "Indicative rate" : "Taux indicatif", value: `1 USDT = ${nfCad.format(r)} CAD` },
          ]} />
          <p className="ac-help">
            <T en="The desk replies with a firm price. Nothing is committed until you accept it.">
              Le desk vous répond avec un prix ferme. Rien n'est engagé tant que vous ne l'avez pas accepté.
            </T>
          </p>
        </div>

        {next(() => setStep("network"), value <= 0 || belowMin)}
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
        />
        <NetworkPick list={openNetworks(networks)} value={net} onPick={(id) => { if (id !== net) setAddress(""); setNet(id); }} />

        {side === "buy" && network && (
          <div className="mt-10">
            <div className="flex items-center gap-2.5">
              <img src={`/coins/${network.id}.svg`} alt="" className="h-6 w-6 rounded-full" draggable={false} />
              <span className="ac-k">{t("otcApp.usdtAddress")}</span>
              <span className="ml-auto text-[12px] text-muted-foreground">{network.tag}</span>
            </div>
            <input
              type="text"
              spellCheck={false}
              autoCapitalize="none"
              aria-label={t("otcApp.usdtAddress")}
              placeholder={`${t("buy.yourAddr")} ${network.tag}`}
              value={address}
              onChange={(e) => setAddress(e.target.value.trim())}
              className="ac-in mono mt-2"
            />
            <RecipientBook kind="wallet" network={net} value={address} onPick={setAddress} />
          </div>
        )}

        {next(() => setStep("funds"), !net || (side === "buy" && address.length < 12))}
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
        />
        <div className="grid gap-9">
          <div>
            <p className="ac-k mb-3">{t("otcApp.usage")}</p>
            <Pills options={USAGE_KEYS} value={usage} onChange={setUsage} />
          </div>
          <div>
            <p className="ac-k mb-3">{t("otcApp.source")}</p>
            <Pills options={SOURCE_KEYS} value={source} onChange={setSource} />
          </div>
          <div>
            <p className="ac-k"><T en="Details (optional)">Précisions (facultatif)</T></p>
            <textarea
              rows={3}
              maxLength={1000}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              aria-label={lang === "en" ? "Details" : "Précisions"}
              placeholder={lang === "en" ? "Timing, recurring trades, questions for the desk…" : "Délai souhaité, opérations régulières, questions pour le desk…"}
              className="ac-in mt-1 resize-none leading-relaxed"
            />
          </div>
        </div>

        {next(() => setStep("recap"), !usage || !source)}
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
        />
        <Facts rows={recap} />
        <p className="ac-help">
          <T en="The desk will reply to">Le desk vous répondra à</T> <span className="font-medium text-foreground">{user?.email}</span>.
        </p>

        {err && <p className="ac-note">{err}</p>}

        <Actions>
          <Action disabled={sending} onClick={submit}><T en="Send request">Envoyer la demande</T></Action>
        </Actions>
      </AppShell>
    );
  }

  return (
    <AppShell header={<StepHeader title={t("otcApp.sentTitle")} sub={t("otcApp.sentSub")} />}>
      <p className="mb-6 flex items-start gap-2.5 text-[14px] leading-relaxed text-muted-foreground">
        <Check className="mt-0.5 h-4 w-4 shrink-0 text-foreground" strokeWidth={2.4} />
        <span>{t("otcApp.contactAt")} <span className="font-semibold text-foreground">{user?.email}</span> {t("otcApp.contactAt2")}</span>
      </p>

      <Facts rows={recap.slice(0, 4)} />

      <p className="ac-k mt-10">{t("otcApp.yourRef")}</p>
      <div className="ac-lines mt-1">
        <CopyRow label={t("otcApp.requestRef")} value={ref} mono />
        <CopyRow label={lang === "en" ? "OTC desk" : "Desk OTC"} value={otcEmail} mono />
      </div>

      <Actions>
        <Action to="/app">{t("otcApp.done")}</Action>
        <Action quiet onClick={reset}><T en="New request">Nouvelle demande</T></Action>
      </Actions>
    </AppShell>
  );
}

export default AppOTC;
