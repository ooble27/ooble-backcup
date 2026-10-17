/**
 * Pièces à plat communes aux parcours de l'app (Acheter, Vendre…) : titre d'étape avec retour,
 * page « fermé », champ de montant, choix de blockchain et récapitulatif. Styles : flat.ts,
 * chargé une fois par AppShell.
 */
import { Link } from "react-router-dom";
import { ArrowLeft, Check, ShieldOff } from "lucide-react";
import AppShell from "@/components/app/AppShell";
import type { Network } from "@/components/app/networks";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

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

/** Le montant : étiquette, CAD / USDT et Min / Max en mots soulignés, le nombre en très grand. */
export const AmountField = <U extends string>({ label, units, unit, onUnit, value, onChange, disabled, onMin, onMax, children }: {
  label: string; units: U[]; unit: U; onUnit: (u: U) => void; value: string; onChange: (v: string) => void; disabled?: boolean;
  onMin?: () => void; onMax?: () => void; children?: React.ReactNode;
}) => (
  <div>
    <div className="flex flex-wrap items-baseline justify-between gap-3">
      <p className="ac-k">{label}</p>
      <div className="flex items-baseline gap-5">
        <div className="ac-opts" role="group" aria-label="CAD / USDT">
          {units.map((u) => (
            <button key={u} type="button" aria-pressed={unit === u} onClick={() => onUnit(u)}>{u}</button>
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
        {unit === "USDT" && <img src="/coins/usdt.svg" alt="" className="h-5 w-5" />}
        {unit}
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

/** Récapitulatif : libellé à gauche, valeur à droite, séparés par un trait fin. */
export const Facts = ({ rows }: { rows: { label: string; value: string; mono?: boolean }[] }) => (
  <div className="ac-lines">
    {rows.map((r) => (
      <div key={r.label} className={cn("ac-kv", r.mono && "mono")}><span>{r.label}</span><span>{r.value}</span></div>
    ))}
  </div>
);
