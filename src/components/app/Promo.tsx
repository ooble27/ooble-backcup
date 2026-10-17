import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { bpsText, previewBonus, type Bonus, type Side } from "@/lib/growth";
import { useLang, useT } from "@/lib/i18n";

/**
 * Avantage sur le taux d'une commande : bonus de parrainage (automatique) ou code promo saisi.
 * L'aperçu vient de la base ; c'est elle qui l'applique à la commande.
 */
export function useBonus(side: Side) {
  const [applied, setApplied] = useState("");
  const [bonus, setBonus] = useState<Bonus>({ bps: 0, reason: null, problem: null });
  useEffect(() => {
    let on = true;
    previewBonus(side, applied || null).then((b) => { if (on) setBonus(b); }).catch(() => {});
    return () => { on = false; };
  }, [side, applied]);
  return {
    bonus,
    applied,
    apply: (code: string) => setApplied(code.trim().toUpperCase()),
    clear: () => setApplied(""),
    /** Code à envoyer avec la commande : seulement s'il donne l'avantage retenu. */
    codeForOrder: bonus.reason === "promo" ? applied : undefined,
  };
}

/** Sous le montant : l'avantage en cours, et le lien « Code promo ». */
export function PromoField({ state }: { state: ReturnType<typeof useBonus> }) {
  const t = useT();
  const [lang] = useLang();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const { bonus, applied } = state;
  const pct = bpsText(bonus.bps, lang);

  const line = bonus.bps > 0
    ? bonus.reason === "promo" ? t("promo.applied").replace("{code}", applied).replace("{pct}", pct)
      : bonus.reason === "referral_new" ? t("promo.referral").replace("{pct}", pct)
        : t("promo.sponsor").replace("{pct}", pct)
    : null;

  return (
    <div className="mt-4">
      {line && (
        <p className="ac-help flex items-center gap-1.5" style={{ marginTop: 0 }}>
          <Check className="h-3.5 w-3.5 shrink-0" strokeWidth={2.4} /> {line}
          {bonus.reason === "promo" && (
            <button type="button" className="ac-link ml-2" onClick={() => { state.clear(); setCode(""); }}>{t("promo.remove")}</button>
          )}
        </p>
      )}
      {applied && bonus.problem && <p className="ac-note" style={{ marginTop: line ? 6 : 0 }}>{lang === "en" ? t("promo.invalid") : bonus.problem}</p>}

      {bonus.reason !== "promo" && (open ? (
        <form className="mt-3 flex items-end gap-4" onSubmit={(e) => { e.preventDefault(); if (code.trim()) state.apply(code); }}>
          <input
            autoFocus
            spellCheck={false}
            autoCapitalize="characters"
            aria-label={t("promo.link")}
            placeholder={t("promo.placeholder")}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\s/g, "").toUpperCase())}
            className="ac-in mono"
            style={{ flex: 1, minWidth: 0 }}
          />
          <button type="submit" className="ac-link shrink-0" disabled={!code.trim()}>{t("promo.apply")}</button>
        </form>
      ) : (
        <button type="button" className="ac-link mt-2" onClick={() => setOpen(true)}>{t("promo.link")}</button>
      ))}
    </div>
  );
}
