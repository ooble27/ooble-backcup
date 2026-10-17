import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLang } from "@/lib/i18n";

interface CopyRowProps {
  label: string;
  value: string;
  mono?: boolean;
}

/** Ligne d'instruction avec copie en un tap (retour visuel), à plat. */
const CopyRow = ({ label, value, mono }: CopyRowProps) => {
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
    <div className="flex items-center gap-3 py-3.5">
      <div className="min-w-0 flex-1">
        <p className="text-[13px] text-muted-foreground">{label}</p>
        <p className={cn("mt-0.5 truncate text-[16px] font-semibold", mono && "font-mono")}>{value}</p>
      </div>
      <button
        type="button"
        onClick={copy}
        aria-label={lang === "en" ? `Copy ${label}` : `Copier ${label}`}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-all hover:text-foreground active:scale-90"
      >
        {done ? <Check className="h-4 w-4 text-foreground" strokeWidth={2.6} /> : <Copy className="h-4 w-4" strokeWidth={1.9} />}
      </button>
    </div>
  );
};

export default CopyRow;
