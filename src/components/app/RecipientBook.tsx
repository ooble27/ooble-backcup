import { useEffect, useState } from "react";
import { BookmarkPlus, Check, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { T, useLang } from "@/lib/i18n";
import {
  listRecipients,
  peekRecipients,
  removeRecipient,
  saveRecipient,
  touchRecipient,
  type RecipientKind,
  type SavedRecipient,
} from "@/lib/recipients";
import type { NetId } from "@/components/app/networks";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";

interface Props {
  kind: RecipientKind;
  /** Requis pour `wallet` : filtre le carnet sur le réseau de l'ordre. */
  network?: NetId | null;
  /** Valeur actuellement saisie, pour surligner l'entrée choisie. */
  value: string;
  onPick: (value: string) => void;
}

const short = (v: string) => (v.length > 22 ? `${v.slice(0, 10)}…${v.slice(-8)}` : v);

/**
 * Carnet de destinataires : liste les entrées enregistrées et permet d'ajouter
 * la valeur saisie. Évite au client de retaper son adresse ou son courriel
 * Interac à chaque ordre.
 */
const RecipientBook = ({ kind, network, value, onPick }: Props) => {
  const [lang] = useLang();
  const { user } = useAuth();
  // Carnet déjà en cache : affiché tout de suite, relu en arrière-plan.
  const [items, setItems] = useState<SavedRecipient[] | null>(() => peekRecipients(user?.id, kind, network) ?? null);
  const [label, setLabel] = useState("");
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const isWallet = kind === "wallet" || kind === "sender";
  const trimmed = value.trim();

  const reload = () => {
    void listRecipients(kind, network).then(setItems);
  };

  useEffect(() => {
    let alive = true;
    const known = peekRecipients(user?.id, kind, network);
    if (known) setItems(known);
    listRecipients(kind, network).then((rows) => {
      if (alive) setItems(rows);
    });
    return () => { alive = false; };
  }, [kind, network, user?.id]);

  const alreadySaved = (items ?? []).some((i) => i.value === trimmed);
  // Pas de proposition tant que le carnet n'est pas connu (elle sauterait).
  const canOfferSave = items !== null && trimmed.length >= (isWallet ? 12 : 5) && !alreadySaved;

  const pick = (r: SavedRecipient) => {
    onPick(r.value);
    void touchRecipient(r.id);
  };

  const confirmSave = async () => {
    if (busy) return;
    setBusy(true);
    setErr(null);
    const res = await saveRecipient({ kind, label, value: trimmed, network });
    setBusy(false);
    if ("error" in res) {
      setErr(res.error);
      return;
    }
    setLabel("");
    setAdding(false);
    reload();
  };

  const drop = async (id: string) => {
    setBusy(true);
    await removeRecipient(id);
    setBusy(false);
    reload();
  };

  return (
    <div className="mt-8">
      {items && items.length > 0 && (
        <>
          <p className="ac-k">
            {isWallet
              ? (lang === "en" ? "Saved addresses" : "Adresses enregistrées")
              : (lang === "en" ? "Saved emails" : "Courriels enregistrés")}
          </p>
          <div className="ac-lines mt-1">
            {items.map((r) => {
              const sel = r.value === trimmed;
              return (
                <div key={r.id} className="flex items-center gap-3">
                  <button type="button" onClick={() => pick(r)} className={cn("ac-row pick", sel && "on")}>
                    {sel ? <Check className="ac-ico" strokeWidth={2.2} style={{ color: "hsl(var(--foreground))" }} /> : <BookmarkPlus className="ac-ico" strokeWidth={1.7} />}
                    <span className="ac-txt">
                      <span className="ac-n">{r.label}</span>
                      <span className="ac-d font-mono">{short(r.value)}</span>
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => drop(r.id)}
                    disabled={busy}
                    aria-label={lang === "en" ? `Delete ${r.label}` : `Supprimer ${r.label}`}
                    className="flex h-8 w-8 shrink-0 items-center justify-center text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
                  >
                    <Trash2 className="h-4 w-4" strokeWidth={1.7} />
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}

      {canOfferSave && !adding && (
        <button type="button" onClick={() => setAdding(true)} className="ac-link mt-4">
          <BookmarkPlus className="h-4 w-4" strokeWidth={1.8} />
          {isWallet
            ? (lang === "en" ? "Save this address" : "Enregistrer cette adresse")
            : (lang === "en" ? "Save this email" : "Enregistrer ce courriel")}
        </button>
      )}

      {canOfferSave && adding && (
        <div className="mt-5">
          <input
            autoFocus
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            aria-label={lang === "en" ? "Name" : "Nom"}
            placeholder={isWallet
              ? (lang === "en" ? "Name (e.g. My Ledger)" : "Nom (ex. Mon Ledger)")
              : (lang === "en" ? "Name (e.g. Main account)" : "Nom (ex. Compte principal)")}
            maxLength={60}
            /* 16 px minimum : en dessous, iOS zoome automatiquement sur le champ. */
            className="ac-in"
          />
          {err && <p className="ac-note">{err}</p>}
          <div className="mt-4 flex items-center gap-4">
            <Button
              variant="appPrimary"
              shape="soft"
              className="h-auto px-3.5 py-2 text-[13px]"
              disabled={!label.trim() || busy}
              onClick={confirmSave}
            >
              {busy
                ? <T en="Saving…">Enregistrement…</T>
                : <T en="Save">Enregistrer</T>}
            </Button>
            <button type="button" className="ac-back" style={{ margin: 0 }} onClick={() => { setAdding(false); setLabel(""); setErr(null); }}>
              <T en="Cancel">Annuler</T>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default RecipientBook;
