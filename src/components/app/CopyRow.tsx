import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLang } from "@/lib/i18n";

interface CopyRowProps {
  label: string;
  value: string;
  mono?: boolean;
  /** À plat (nouveau style) : pas de marge intérieure ni de bouton encadré. */
  flat?: boolean;
}

/** Ligne d'instruction avec copie en un tap (retour visuel). */
const CopyRow = ({ label, value, mono, flat }: CopyRowProps) => {
  const [lang] = useLang();
  const [done, setDone] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setDone(true);
      setTimeout(() => setDone(false), 1500);
    } catch {
      /* presse-papiers indisponible */
    }
  };

  return (
    <div className={cn("flex items-center gap-3 py-3.5", !flat && "px-4")}>
      <div className="min-w-0 flex-1">
        <p className={cn("text-muted-foreground", flat ? "text-[13px]" : "text-xs")}>{label}</p>
        <p className={cn("truncate font-semibold", flat ? "mt-0.5 text-[16px]" : "text-[15px]", mono && "font-mono")}>{value}</p>
      </div>
      <button
        type="button"
        onClick={copy}
        aria-label={lang === "en" ? `Copy ${label}` : `Copier ${label}`}
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-all active:scale-90",
          flat ? "hover:text-foreground" : "border border-border hover:bg-secondary",
        )}
      >
        {done ? <Check className="h-4 w-4 text-foreground" strokeWidth={2.6} /> : <Copy className="h-4 w-4" strokeWidth={1.9} />}
      </button>
    </div>
  );
};

export default CopyRow;
