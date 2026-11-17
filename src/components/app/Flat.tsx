/**
 * Pièces à plat communes aux parcours de l'app (Acheter, Vendre…) : titre d'étape avec retour,
 * page « fermé », champ de montant, choix de blockchain et récapitulatif. Styles : flat.ts,
 * chargé une fois par AppShell.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ArrowRight, Check, Clock, Copy, ShieldOff } from "lucide-react";
import AppShell from "@/components/app/AppShell";
import type { Network } from "@/components/app/networks";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { AssetId } from "@/lib/settings";

/** Titre d'une étape : « ← Retour » au-dessus, le titre en grand, une phrase. */
export const StepHeader = ({ title, sub, onBack, step, total }: { title: string; sub?: string; onBack?: () => void; step?: number; total?: number }) => {
  const t = useT();
  return (
    <div className="mb-8">
      {onBack && (
        <button type="button" className="ac-back" onClick={onBack}>
          <ArrowLeft className="h-[15px] w-[15px]" />{t("misc.back")}
        </button>
      )}
      {/* Barre d'étapes : faites en noir, en cours en blanc au trait noir, à venir en clair. */}
      {step && total && (
        <div className="ac-steps" role="progressbar" aria-valuemin={1} aria-valuemax={total} aria-valuenow={step}>
          {Array.from({ length: total }, (_, i) => <span key={i} className={i + 1 < step ? "on" : i + 1 === step ? "cur" : undefined} />)}
        </div>
      )}
      <h1 className="ac-title">{title}</h1>
      {sub && <p className="ac-sub">{sub}</p>}
    </div>
  );
};

/** Achats ou ventes fermés aux clients : une page d'attente en texte. */
export const ClosedPage = ({ title, message }: { title: string; message: string }) => {
  const t = useT();
  return (
    <AppShell center>
      <div className="py-16">
        <ShieldOff className="h-7 w-7 text-muted-foreground" strokeWidth={1.5} />
        <h1 className="ac-title mt-5">{title}</h1>
        <p className="ac-sub">{message}</p>
        <Link to="/app" className="ac-link mt-6"><ArrowLeft className="h-4 w-4" /> {t("trade.backToDash")}</Link>
      </div>
    </AppShell>
  );
};

/**
 * Le montant : étiquette, CAD / cryptomonnaie et Min / Max en mots soulignés, le nombre en très grand.
 * L'unité « USDT » désigne la cryptomonnaie de la commande : `coin` donne son symbole affiché (USDC…).
 */
export const AmountField = <U extends string>({ label, units, unit, onUnit, value, onChange, disabled, onMin, onMax, coin = "USDC", result, children }: {
  label: string; units: U[]; unit: U; onUnit: (u: U) => void; value: string; onChange: (v: string) => void; disabled?: boolean;
  onMin?: () => void; onMax?: () => void; coin?: string;
  /** La conversion, bien en vue sous le montant : « Vous recevez 342,16 USDC », puis le taux en petit. */
  result?: { label: string; value: string; coin?: string; rate: string };
  children?: React.ReactNode;
}) => (
  <div>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="ac-k">{label}</p>
      <div className="ac-opts ac-seg" role="group" aria-label={`CAD / ${coin}`}>
        {units.map((u) => (
          <button key={u} type="button" aria-pressed={unit === u} onClick={() => onUnit(u)}>{u === "USDT" ? coin : u}</button>
        ))}
      </div>
    </div>
    <div className="relative mt-1">
      <input
        inputMode="decimal"
        placeholder="0"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        aria-label={label}
        className="ac-in ac-amount"
      />
      <span className="pointer-events-none absolute bottom-4 right-0 flex items-center gap-1.5 text-[17px] font-medium text-muted-foreground">
        {unit === "USDT" && <img src={`/coins/${coin.toLowerCase()}.svg`} alt="" className="h-5 w-5" />}
        {unit === "USDT" ? coin : "$"}
      </span>
    </div>
    {result && (
      <div className="ac-result">
        <span className="ac-result-k">{result.label}</span>
        <span className="ac-result-v">
          {result.coin && <img src={`/coins/${result.coin.toLowerCase()}.svg`} alt="" className="h-7 w-7 shrink-0" />}
          {result.value}
        </span>
        <span className="ac-result-r">{result.rate}</span>
      </div>
    )}
    {(onMin || onMax) && (
      <div className="ac-chips" role="group" aria-label={label}>
        {onMin && <button type="button" onClick={onMin}>Min</button>}
        {onMax && <button type="button" onClick={onMax}>Max</button>}
      </div>
    )}
    {children}
  </div>
);

/** Une chose à copier, numérotée (1, 2, 3) dans une pastille au trait noir ; `mark` la met en jaune pâle. */
export const NumberedCopy = ({ n, label, value, mono, mark }: { n: number; label: string; value: string; mono?: boolean; mark?: boolean }) => {
  const t = useT();
  const [done, setDone] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(value); setDone(true); window.setTimeout(() => setDone(false), 1500); } catch { /* presse-papiers indisponible */ }
  };
  return (
    <button type="button" className={cn("ac-copy", mark && "mark")} onClick={copy} aria-label={`${t("misc.copy")} ${label}`}>
      <span className="ac-copy-n">{n}</span>
      <span className="min-w-0 flex-1 text-left">
        <span className="block text-[12px] text-[#555]">{label}</span>
        <span className={cn("block truncate text-[16px] font-medium text-[#111]", mono && "font-mono text-[15px]")}>{value}</span>
      </span>
      {done ? <Check className="h-[18px] w-[18px] shrink-0" strokeWidth={2.4} /> : <Copy className="h-[18px] w-[18px] shrink-0" strokeWidth={1.9} />}
    </button>
  );
};

/** Le temps qu'il reste avant une heure limite, en pastille (mm:ss), relu chaque seconde. */
export const Countdown = ({ until }: { until: Date }) => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const id = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(id); }, []);
  const left = Math.max(0, Math.floor((until.getTime() - now) / 1000));
  const mm = String(Math.floor(left / 60)).padStart(2, "0"), ss = String(left % 60).padStart(2, "0");
  return <span className="ac-timer" aria-live="off"><Clock className="h-[14px] w-[14px]" strokeWidth={2.2} />{mm}:{ss}</span>;
};

/** Choix d'une blockchain : une ligne par réseau, le choix retenu en clair avec une coche. */
export const NetworkPick = ({ list, value, onPick }: { list: Network[]; value: string | null; onPick: (id: Network["id"]) => void }) => (
  <div className="ac-lines" role="radiogroup">
    {list.map((n) => {
      const on = value === n.id;
      return (
        <button key={n.id} type="button" role="radio" aria-checked={on} className={cn("ac-row pick", on && "on")} onClick={() => onPick(n.id)}>
          <img src={`/coins/${n.id}.svg`} alt="" className="h-7 w-7 shrink-0 rounded-full" draggable={false} />
          <span className="ac-txt"><span className="ac-n">{n.name}</span></span>
          <span className="ac-v">{n.tag}</span>
          <Check className={cn("h-[18px] w-[18px] shrink-0 transition-opacity", on ? "opacity-100" : "opacity-0")} strokeWidth={2.2} />
        </button>
      );
    })}
  </div>
);

/**
 * Récapitulatif : libellé à gauche, valeur à droite, séparés par un trait fin.
 * `usdt` : logo de la cryptomonnaie devant la valeur (`coin` : son symbole, USDC par défaut).
 */
export const Facts = ({ rows }: { rows: { label: string; value: string; mono?: boolean; usdt?: boolean; coin?: string }[] }) => (
  <div className="ac-lines">
    {rows.map((r) => (
      <div key={r.label} className={cn("ac-kv", r.mono && "mono")}>
        <span>{r.label}</span>
        <span className={r.usdt ? "inline-flex items-center justify-end gap-1.5" : undefined}>
          {r.usdt && <img src={`/coins/${(r.coin ?? "USDC").toLowerCase()}.svg`} alt="" className="h-[18px] w-[18px] shrink-0" />}
          {r.value}
        </span>
      </div>
    ))}
  </div>
);

/** Les actions d'une étape, à plat : la principale soulignée avec une flèche, les autres en gris. */
export const Actions = ({ children }: { children: React.ReactNode }) => (
  <div className="mt-10 flex flex-wrap items-center gap-x-9 gap-y-3">{children}</div>
);

export const Action = ({ children, onClick, to, disabled, quiet }: {
  children: React.ReactNode; onClick?: () => void; to?: string; disabled?: boolean; quiet?: boolean;
}) => {
  const inner = <>{children}{!quiet && <ArrowRight className="h-[18px] w-[18px]" strokeWidth={2} />}</>;
  if (to) return <Link to={to} className={cn("ac-act", quiet && "quiet")}>{inner}</Link>;
  return <button type="button" className={cn("ac-act", quiet && "quiet")} disabled={disabled} onClick={onClick}>{inner}</button>;
};

/** Choix de la cryptomonnaie, en mots soulignés ; rien n'est affiché quand une seule est proposée. */
export const AssetPick = ({ list, value, onPick, label }: { list: { id: AssetId; symbol: string }[]; value: AssetId; onPick: (a: AssetId) => void; label: string }) =>
  list.length < 2 ? null : (
    <div className="mb-8 flex flex-wrap items-baseline justify-between gap-3">
      <p className="ac-k">{label}</p>
      <div className="ac-opts" role="group" aria-label={label}>
        {list.map((a) => (
          <button key={a.id} type="button" aria-pressed={value === a.id} onClick={() => onPick(a.id)} className="inline-flex items-center gap-1.5">
            <img src={`/coins/${a.id}.svg`} alt="" className="h-4 w-4" />{a.symbol}
          </button>
        ))}
      </div>
    </div>
  );
