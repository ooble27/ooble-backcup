/**
 * Réglages › Adresses de dépôt : où les clients envoient leurs USDT quand ils vendent.
 *
 * Une adresse par famille de réseaux. Changer une adresse se fait en deux temps : on colle la
 * nouvelle (le format est vérifié en direct), puis on retape ses 6 derniers caractères en la
 * comparant au portefeuille. L'ancienne adresse reste surveillée 7 jours par sell-watch, pour
 * qu'un client qui y envoie encore ses USDT soit quand même reconnu.
 */
import { useEffect, useState } from "react";
import { peek, put } from "@/lib/adminCache";
import { logAdminAction } from "@/lib/audit";
import {
  ADDRESS_FORMAT, FAMILY_LABEL, fetchDepositAddressBook, fetchDepositAddresses, setDepositAddress,
  type AddressFamily, type DepositAddressEntry,
} from "@/lib/depositAddresses";
import { C } from "./adminTheme";
import { Button } from "./ui";
import { SettingsPage, fmtDay } from "./settingsUi";

const FAMILIES: AddressFamily[] = ["evm", "tron", "solana"];
const WATCH_DAYS = 7;
const FORMAT_HINT: Record<AddressFamily, string> = {
  evm: "Une adresse EVM commence par 0x et compte 42 caractères.",
  tron: "Une adresse Tron commence par T et compte 34 caractères.",
  solana: "Une adresse Solana compte de 32 à 44 caractères, sans 0, O, I ni l.",
};

const CSS = `
.dp-addr { margin: 14px 0 0; font-size: 18px; line-height: 1.5; letter-spacing: 0.01em; word-break: break-all; color: var(--a-t2); font-variant-numeric: tabular-nums; }
.dp-addr b { color: var(--a-t1); font-weight: 600; }
.dp-acts { display: flex; gap: 20px; margin-top: 10px; }
.dp-in { width: 100%; box-sizing: border-box; border: none; border-radius: 0; background: linear-gradient(var(--a-sun), var(--a-sun)) no-repeat left bottom / 0 1.5px, linear-gradient(color-mix(in srgb, var(--a-t3) 35%, transparent), color-mix(in srgb, var(--a-t3) 35%, transparent)) no-repeat left bottom / 100% 1px; color: var(--a-t1); font: inherit; font-size: 18px; letter-spacing: 0.01em; padding: 6px 0 10px; caret-color: var(--a-sun); overflow-wrap: anywhere; transition: background-size .35s cubic-bezier(.2,.7,.2,1); }
.dp-in::placeholder { color: var(--a-t3); }
.dp-in:focus { outline: none; background-size: 100% 1.5px, 100% 1px; }
.dp-in.short { width: 9ch; text-align: center; font-size: 24px; letter-spacing: 0.12em; }
.dp-flow { display: grid; gap: 14px; margin-top: 18px; animation: st-in .35s cubic-bezier(.22,1,.36,1) both; }
.dp-old { display: grid; gap: 10px; margin-top: 20px; }
.dp-old p { margin: 0; font-size: 13px; line-height: 1.5; color: var(--a-t3); transition: transform .3s cubic-bezier(.22,1,.36,1); }
.dp-old p:hover { transform: translateX(4px); }
`;

/** Les 6 premiers et 6 derniers caractères ressortent : c'est ce qu'on compare avec le portefeuille. */
function Addr({ value }: { value: string }) {
  if (value.length <= 14) return <p className="dp-addr"><b>{value}</b></p>;
  return <p className="dp-addr"><b>{value.slice(0, 6)}</b>{value.slice(6, -6)}<b>{value.slice(-6)}</b></p>;
}
const short = (a: string) => (a.length > 14 ? `${a.slice(0, 6)}…${a.slice(-6)}` : a);

function Family({ family, entries, onChanged }: { family: AddressFamily; entries: DepositAddressEntry[]; onChanged: () => void }) {
  const active = entries.find((e) => e.active) ?? null;
  const retired = entries.filter((e) => !e.active).slice(0, 5);
  const [open, setOpen] = useState(false);
  const [next, setNext] = useState("");
  const [step, setStep] = useState<1 | 2>(1);
  const [tail, setTail] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const candidate = next.trim();
  const formatOk = ADDRESS_FORMAT[family].test(candidate);
  const same = !!active && candidate === active.address;
  const tailOk = tail.trim() === candidate.slice(-6);

  const reset = () => { setOpen(false); setNext(""); setStep(1); setTail(""); setErr(null); };
  const copy = async () => {
    if (!active) return;
    try { await navigator.clipboard.writeText(active.address); setCopied(true); window.setTimeout(() => setCopied(false), 1600); } catch { /* presse-papiers indisponible */ }
  };
  const replace = async () => {
    setBusy(true); setErr(null);
    const r = await setDepositAddress(family, candidate);
    setBusy(false);
    if (r.error) { setErr(r.error); return; }
    void logAdminAction({ action: "deposit_address.set", entityKind: "deposit_address", metadata: { family, address: candidate, previous: active?.address ?? null } });
    void fetchDepositAddresses();
    setDone(active ? `Nouvelle adresse en place. L'ancienne reste surveillée ${WATCH_DAYS} jours.` : "Adresse en place.");
    reset();
    onChanged();
  };

  const label = FAMILY_LABEL[family];
  return (
    <section>
      <h3 className="st-h3">{label.name}</h3>
      <p className="st-hint">{label.networks}</p>

      {active ? (
        <>
          <Addr value={active.address} />
          <p className="st-hint">En place depuis le {fmtDay(active.addedAt)}{active.addedByName ? `, par ${active.addedByName}` : ""}.</p>
        </>
      ) : <p className="st-desc" style={{ color: C.coral }}>Aucune adresse : les clients ne peuvent pas vendre sur {family === "evm" ? "ces réseaux" : "ce réseau"}.</p>}

      {!open && (
        <div className="dp-acts">
          {active && <button type="button" className="st-link" onClick={copy} style={{ color: copied ? C.sage : undefined }}>{copied ? "Copiée" : "Copier"}</button>}
          <button type="button" className="st-link" onClick={() => { setDone(null); setOpen(true); }}>{active ? "Changer d'adresse" : "Ajouter une adresse"}</button>
        </div>
      )}
      {done && !open && <p className="st-hint" style={{ color: C.sage }}>{done}</p>}

      {open && step === 1 && (
        <div className="dp-flow">
          <input className="dp-in" autoFocus spellCheck={false} autoComplete="off" placeholder={`Nouvelle adresse ${label.name}`} value={next}
            onChange={(e) => setNext(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && formatOk && !same) setStep(2); if (e.key === "Escape") reset(); }} />
          <p className="st-hint" style={{ margin: 0, color: !candidate ? C.t3 : same ? C.sun : formatOk ? C.sage : C.coral }}>
            {!candidate ? FORMAT_HINT[family] : same ? "C'est déjà l'adresse en place." : formatOk ? "Format valide." : FORMAT_HINT[family]}
          </p>
          <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
            <Button variant="primary" disabled={!formatOk || same} onClick={() => setStep(2)}>Continuer</Button>
            <button type="button" className="st-link" onClick={reset}>Annuler</button>
          </div>
        </div>
      )}

      {open && step === 2 && (
        <div className="dp-flow">
          <p className="st-desc" style={{ margin: 0 }}>Ouvrez le portefeuille et comparez. Puis tapez les <b style={{ color: C.t1, fontWeight: 500 }}>6 derniers caractères</b> de la nouvelle adresse :</p>
          <Addr value={candidate} />
          <input className="dp-in short" autoFocus spellCheck={false} autoComplete="off" maxLength={6} value={tail} aria-label="6 derniers caractères"
            onChange={(e) => setTail(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && tailOk && !busy) void replace(); if (e.key === "Escape") reset(); }} />
          <p className="st-hint" style={{ margin: 0, color: C.sun }}>Une adresse fausse fait perdre les USDT que les clients y envoient. Elle s'applique tout de suite aux nouvelles ventes.</p>
          <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
            <Button variant="primary" disabled={!tailOk || busy} onClick={replace}>{active ? "Remplacer l'adresse" : "Enregistrer l'adresse"}</Button>
            <button type="button" className="st-link" onClick={() => { setStep(1); setTail(""); }}>Retour</button>
            <button type="button" className="st-link" onClick={reset}>Annuler</button>
          </div>
          {err && <p className="st-hint" style={{ margin: 0, color: C.coral }}>{err}</p>}
        </div>
      )}

      {retired.length > 0 && (
        <div className="dp-old">
          {retired.map((e) => {
            const until = e.retiredAt ? new Date(new Date(e.retiredAt).getTime() + WATCH_DAYS * 86400000) : null;
            const watched = !!until && until.getTime() > Date.now();
            return (
              <p key={e.id}>
                <span style={{ color: C.t2 }}>{short(e.address)}</span>
                {e.retiredAt && <> · remplacée le {fmtDay(e.retiredAt)}</>}
                {until && <> · <span style={{ color: watched ? C.sun : C.t3 }}>{watched ? `surveillée jusqu'au ${until.toLocaleDateString("fr-CA", { day: "numeric", month: "long" })}` : "plus surveillée"}</span></>}
              </p>
            );
          })}
        </div>
      )}
    </section>
  );
}

export default function SettingsDeposit({ onBack }: { onBack: () => void }) {
  const [book, setBook] = useState<DepositAddressEntry[] | null>(() => peek<DepositAddressEntry[]>("st.deposit")?.value ?? null);
  const [err, setErr] = useState<string | null>(null);
  const load = () => fetchDepositAddressBook().then((b) => { setBook(b); put("st.deposit", b); }).catch((e) => setErr((e as Error).message));
  useEffect(() => { void load(); }, []);

  const missing = book ? FAMILIES.filter((f) => !book.some((e) => e.family === f && e.active)) : [];
  return (
    <SettingsPage onBack={onBack}
      title={!book ? <span className="mute">Adresses de dépôt</span> : missing.length ? (
        <><span style={{ color: C.coral }}>{missing.map((f) => FAMILY_LABEL[f].name).join(" et ")}</span> <span className="mute">{missing.length > 1 ? "n'ont" : "n'a"} pas d'adresse de dépôt.</span></>
      ) : (
        <>Les clients envoient leurs USDT à <span style={{ color: C.sage }}>3 adresses</span><span className="mute">, une par famille de réseaux.</span></>
      )}
      desc={`Quand un client vend, l'app lui montre l'adresse de son réseau. En cas de changement, l'ancienne reste surveillée ${WATCH_DAYS} jours : un client qui y envoie encore ses USDT est quand même reconnu.`}>
      <style>{CSS}</style>
      {err && <p className="st-hint" style={{ color: C.coral }}>{err}</p>}
      {book && FAMILIES.map((f) => <Family key={f} family={f} entries={book.filter((e) => e.family === f)} onChanged={() => void load()} />)}
    </SettingsPage>
  );
}
