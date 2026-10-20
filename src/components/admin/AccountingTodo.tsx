import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { nfCad } from "@/lib/adminOrders";
import { monthLabel } from "@/lib/accounting";
import { loadTodo, type AcctTodo } from "@/lib/ledger";
import { C, FONT } from "./adminTheme";

/**
 * « À faire » : en haut de la comptabilité, ce qu'il reste à faire, en phrases simples, chacune avec
 * son action. Quand tout est fait, une seule ligne le dit.
 */

type Go = "bank" | "purchases" | "expenses";
interface Item { text: string; action: string; onClick: () => void }

const CSS = `
.td-go { all: unset; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; font-weight: 600; color: var(--a-t1); white-space: nowrap; text-decoration: underline; text-underline-offset: 4px; }
.td-go:focus-visible { outline: 2px solid var(--a-accent); outline-offset: 3px; }
.td-go svg { transition: transform .15s; }
@media (hover: hover) { .td-go:hover svg { transform: translateX(3px); } }
`;

const daysSince = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);

export function AccountingTodo({ tick, toCheck, onGo, onOpenMonth, onCheck }: {
  tick: number; toCheck: number; onGo: (v: Go) => void; onOpenMonth: (month: string) => void; onCheck: () => void;
}) {
  const [t, setT] = useState<AcctTodo | null>(null);
  useEffect(() => { loadTodo().then(setT).catch(() => undefined); }, [tick]);
  if (!t) return null;

  const items: Item[] = [];
  if (!t.lastImportAt) items.push({ text: "Aucun relevé bancaire importé : télécharge le relevé de ton compte Desjardins en CSV depuis AccèsD.", action: "Importer", onClick: () => onGo("bank") });
  else if (daysSince(t.lastImportAt) >= 8) items.push({ text: `Dernier relevé importé il y a ${daysSince(t.lastImportAt)} jours : importe le nouveau.`, action: "Importer", onClick: () => onGo("bank") });
  if (t.openLines > 0) items.push({ text: `${t.openLines} ligne${t.openLines > 1 ? "s" : ""} du relevé à traiter.`, action: "Traiter", onClick: () => onGo("bank") });
  else if (t.unexplained != null && Math.abs(t.unexplained) >= 0.01) items.push({ text: `Il reste un écart de ${nfCad.format(t.unexplained)} $ entre ta banque et tes comptes.`, action: "Voir", onClick: () => onGo("bank") });
  if (t.hasOrders && t.purchases === 0) items.push({ text: "Aucun achat de cryptomonnaie n'est saisi : ajoute ton stock de départ et tes recharges chez le fournisseur, sinon le bénéfice est estimé.", action: "Saisir", onClick: () => onGo("purchases") });
  if (toCheck > 0) items.push({ text: `${toCheck} commande${toCheck > 1 ? "s" : ""} à vérifier : le montant reçu ou envoyé ne correspond pas, ou il manque la preuve.`, action: "Vérifier", onClick: onCheck });
  if (t.expensesWithoutReceipt > 0) items.push({ text: `${t.expensesWithoutReceipt} dépense${t.expensesWithoutReceipt > 1 ? "s" : ""} sans facture jointe (3 derniers mois).`, action: "Joindre", onClick: () => onGo("expenses") });
  if (t.prevMonthHasOrders && !t.prevMonthClosed && new Date().getDate() >= 5) items.push({ text: `Le mois de ${monthLabel(t.prevMonth).toLowerCase()} n'est pas clôturé : une fois vérifié, verrouille-le pour que rien ne change.`, action: "Clôturer", onClick: () => onOpenMonth(t.prevMonth) });

  return (
    <div style={{ fontFamily: FONT, marginTop: 26, maxWidth: 820 }}>
      <style>{CSS}</style>
      <p style={{ margin: 0, fontSize: 12, letterSpacing: ".08em", textTransform: "uppercase", color: C.t3 }}>À faire</p>
      {items.length === 0 ? (
        <p style={{ margin: "8px 0 0", fontSize: 15, color: C.t1 }}>
          Tout est en ordre : tes comptes sont justes ✓{t.lastStatementOn ? <span style={{ color: C.t3 }}> · relevé à jour au {new Date(`${t.lastStatementOn}T12:00:00`).toLocaleDateString("fr-CA", { day: "numeric", month: "long" })}</span> : null}
        </p>
      ) : items.map((it, i) => (
        <div key={i} style={{ display: "flex", alignItems: "baseline", gap: 18, padding: "11px 0", borderBottom: `1px solid ${C.bds}` }}>
          <span style={{ flex: 1, fontSize: 14.5, lineHeight: 1.5, color: C.t1 }}>{it.text}</span>
          <button type="button" className="td-go" onClick={it.onClick}>{it.action} <ArrowRight style={{ width: 15, height: 15 }} /></button>
        </div>
      ))}
    </div>
  );
}
