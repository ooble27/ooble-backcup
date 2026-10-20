/**
 * Pièces à plat communes aux parcours de l'app (Acheter, Vendre…) : titre d'étape avec retour,
 * page « fermé », champ de montant, choix de blockchain et récapitulatif. Styles : flat.ts,
 * chargé une fois par AppShell.
 */
import { Link } from "react-router-dom";
import { ArrowLeft, ArrowRight, Check, ShieldOff } from "lucide-react";
import AppShell from "@/components/app/AppShell";
import type { Network } from "@/components/app/networks";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { AssetId } from "@/lib/settings";

/** Titre d'une étape : « ← Retour » au-dessus, le titre en grand, une phrase. */
export const StepHeader = ({ title, sub, onBack }: { title: string; sub?: string; onBack?: () => void }) => {
  const t = useT();
  return (
    <div className="mb-8">
      {onBack && (
        <button type="button" className="ac-back" onClick={onBack}>
          <ArrowLeft className="h-[15px] w-[15px]" />{t("misc.back")}
        </button>
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
export const AmountField = <U extends string>({ label, units, unit, onUnit, value, onChange, disabled, onMin, onMax, coin = "USDC", children }: {
  label: string; units: U[]; unit: U; onUnit: (u: U) => void; value: string; onChange: (v: string) => void; disabled?: boolean;
  onMin?: () => void; onMax?: () => void; coin?: string; children?: React.ReactNode;
}) => (
  <div>
    <div className="flex flex-wrap items-baseline justify-between gap-3">
      <p className="ac-k">{label}</p>
      <div className="flex items-baseline gap-5">
        <div className="ac-opts" role="group" aria-label={`CAD / ${coin}`}>
          {units.map((u) => (
            <button key={u} type="button" aria-pressed={unit === u} onClick={() => onUnit(u)}>{u === "USDT" ? coin : u}</button>
          ))}
        </div>
        {(onMin || onMax) && (
          <div className="ac-opts">
            {onMin && <button type="button" onClick={onMin}>Min</button>}
            {onMax && <button type="button" onClick={onMax}>Max</button>}
          </div>
        )}
      </div>
    </div>
    <div className="relative mt-2">
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
        {unit === "USDT" ? coin : unit}
      </span>
    </div>
    {children}
  </div>
);

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
 * `usdt` : logo de la cryptomonnaie devant la valeur (`coin` : son symbole, USDT par défaut).
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
