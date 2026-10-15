import { ClipboardPaste, Hash } from "lucide-react";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/** Identifiant de transaction : on colle l'identifiant seul ou le lien de l'explorateur, il est reconnu dans les deux cas. */
export default function TxField({ label, value, onChange, valid }: { label: string; value: string; onChange: (v: string) => void; valid: boolean }) {
  const t = useT();
  return (
    <div className="mt-4 overflow-hidden rounded-[14px] border border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <Hash className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={2} />
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{label}</span>
        {value && <span className={cn("ml-auto text-[11px] font-medium", valid ? "text-emerald-700 dark:text-emerald-400" : "text-destructive")}>{valid ? t("sell.txOk") : t("sell.txBadShort")}</span>}
      </div>
      <div className="flex items-center gap-2 px-4 py-3">
        <input
          spellCheck={false}
          autoCapitalize="none"
          autoComplete="off"
          placeholder={t("sell.txPh")}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="min-w-0 flex-1 bg-transparent font-mono text-[12.5px] outline-none placeholder:font-sans placeholder:text-muted-foreground/60"
        />
        <button
          type="button"
          onClick={() => { void navigator.clipboard?.readText?.().then((v) => v && onChange(v)).catch(() => {}); }}
          className="flex shrink-0 items-center gap-1.5 rounded-full bg-secondary px-3 py-1.5 text-[12px] font-medium transition-colors hover:bg-secondary/70 active:scale-95"
        >
          <ClipboardPaste className="h-3.5 w-3.5" strokeWidth={2} /> {t("sell.txPaste")}
        </button>
      </div>
    </div>
  );
}
