import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { bpsText, referralInfo, setStoredReferral, storedReferral } from "@/lib/growth";
import { useLang, useT } from "@/lib/i18n";

/**
 * Inscription : « Avez-vous un code de parrainage ? ». Le code venu d'un lien d'invitation est déjà
 * là ; sinon le client le tape. Il est gardé sur l'appareil et rattaché au compte à la première
 * ouverture de l'app (la base vérifie les conditions). Le parrainage ne se fait qu'à l'inscription.
 */
export default function ReferralCodeField() {
  const t = useT();
  const [lang] = useLang();
  const [code, setCode] = useState(() => storedReferral() ?? "");
  const [open, setOpen] = useState(() => !!storedReferral());
  const [info, setInfo] = useState<Awaited<ReturnType<typeof referralInfo>> | null>(null);

  // Vérifie le code pendant la saisie (court délai), et le garde seulement s'il est valable.
  useEffect(() => {
    const c = code.trim();
    if (c.length < 4) { setInfo(null); setStoredReferral(null); return; }
    const id = window.setTimeout(() => {
      referralInfo(c).then((i) => {
        setInfo(i);
        setStoredReferral(i.valid && i.enabled ? c : null);
      }).catch(() => setInfo(null));
    }, 350);
    return () => window.clearTimeout(id);
  }, [code]);

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="mt-4 text-[13.5px] text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline">
        {t("ref.ask")}
      </button>
    );
  }

  const ok = info?.valid && info.enabled;
  return (
    <div className="mt-5">
      <label htmlFor="ref-code" className="text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground/60">{t("ref.label")}</label>
      <input
        id="ref-code"
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 12))}
        autoCapitalize="characters"
        spellCheck={false}
        placeholder={t("ref.placeholder")}
        className="mt-1 w-full border-b border-border bg-transparent pb-2 pt-1 font-mono text-base tracking-[0.06em] text-foreground outline-none transition-colors placeholder:font-sans placeholder:tracking-normal placeholder:text-muted-foreground/40 focus:border-foreground"
      />
      {info && (ok ? (
        <p className="mt-2 flex items-center gap-1.5 text-[13px] text-foreground">
          <Check className="h-3.5 w-3.5 shrink-0" strokeWidth={2.4} />
          {(info.firstName ? t("ref.okFrom").replace("{name}", info.firstName) : t("ref.ok")).replace("{pct}", bpsText(info.bonusBps, lang))}
        </p>
      ) : (
        <p className="mt-2 text-[13px] text-muted-foreground">{info.valid ? t("ref.closed") : t("ref.unknown")}</p>
      ))}
    </div>
  );
}
