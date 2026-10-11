import { useCallback, useEffect, useState } from "react";
import { Check, Eraser, Lock, Power, RotateCcw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import AdminHero from "@/components/admin/AdminHero";
import BackupsCard from "@/components/admin/BackupsCard";
import {
  C, FONT, card, cardHeaderRow, cardTitle, cardSubtitle, btnPrimary, inputStyle, sH, listRowStyle,
} from "@/components/admin/adminTheme";

/*
 * Plateforme : remettre à zéro les commandes de test, puis démarrer les
 * activités. Seules les commandes et ce qui s'y rattache sont effacés ;
 * comptes clients, vérifications, adresses enregistrées et registre de
 * conformité ne sont jamais touchés. Une fois la plateforme lancée, plus de
 * remise à zéro. Le travail est fait côté serveur (fonction edge reset-test-data).
 */

type Count = { table: string; label: string; n: number };
interface Preview {
  launchedAt: string | null;
  lastResetAt: string | null;
  core: Count[];
  mail: Count[];
  logs: Count[];
  keptOrders: number;
}
interface ResetResult { ok: boolean; tables: Record<string, number>; keptOrders: number }

const KEPT = [
  "Comptes clients",
  "Vérifications d'identité et d'entreprise, avec les documents",
  "Adresses et courriels enregistrés par les clients",
  "Registre de conformité, et les commandes qu'il cite",
  "Équipe, règlement auto et trésorerie",
];

const fmtDate = (s: string) => new Date(s).toLocaleString("fr-CA", { dateStyle: "medium", timeStyle: "short" });
const plain = (s: string) => s.trim().toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const sum = (rows: Count[]) => rows.reduce((t, c) => t + c.n, 0);

async function call<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("reset-test-data", { body });
  if (error) {
    const res = (error as { context?: Response }).context;
    const detail = res ? await res.json().catch(() => null) : null;
    throw new Error(detail?.message ?? detail?.error ?? error.message);
  }
  return data as T;
}

/** Interrupteur (case à cocher). */
const Switch = ({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) => (
  <button
    type="button"
    role="switch"
    aria-checked={on}
    aria-label={label}
    onClick={() => onChange(!on)}
    style={{
      width: 36, height: 20, borderRadius: 99, border: "none", padding: 2, cursor: "pointer", flexShrink: 0,
      background: on ? C.accent : C.l4, transition: "background 0.15s",
    }}
  >
    <span style={{
      display: "block", width: 16, height: 16, borderRadius: 99, background: on ? C.btnText : C.t2,
      transform: `translateX(${on ? 16 : 0}px)`, transition: "transform 0.15s",
    }} />
  </button>
);

const Num = ({ n }: { n: number }) => (
  <span style={{ fontVariantNumeric: "tabular-nums", fontSize: 13, color: n ? C.t1 : C.t3, minWidth: 28, textAlign: "right" }}>{n}</span>
);

/** Étape numérotée de la mise en route (vraie séquence : remise à zéro, puis lancement). */
const Step = ({ n, done, children }: { n: number; done: boolean; children: React.ReactNode }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12.5, color: done ? C.t1 : C.t2 }}>
    <span style={{
      width: 22, height: 22, borderRadius: 99, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
      background: done ? C.accent : "transparent", color: done ? C.btnText : C.t3, border: done ? "none" : `1px solid ${C.bd}`, fontSize: 11,
    }}>
      {done ? <Check style={{ width: 12, height: 12 }} strokeWidth={2.5} /> : n}
    </span>
    {children}
  </div>
);

/** Champ de confirmation : le mot à taper, puis le bouton. */
const Confirm = ({ word, value, onChange, onSubmit, disabled, busy, label, danger }: {
  word: string; value: string; onChange: (v: string) => void; onSubmit: () => void;
  disabled: boolean; busy: boolean; label: string; danger?: boolean;
}) => {
  const ready = plain(value) === plain(word) && !disabled && !busy;
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (ready) onSubmit(); }} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <input
        value={value} onChange={(e) => onChange(e.target.value)} placeholder={`Tapez ${word}`} aria-label={`Tapez ${word} pour confirmer`}
        autoComplete="off" spellCheck={false}
        style={{ ...inputStyle, flex: "1 1 200px", height: 36, padding: "0 12px", letterSpacing: "0.06em" }}
      />
      <button
        type="submit" disabled={!ready}
        style={{
          ...btnPrimary, ...(danger ? { background: C.dangerText, color: "#fff" } : {}),
          opacity: ready ? 1 : 0.35, cursor: ready ? "pointer" : "default",
        }}
      >
        {busy ? "Un instant…" : label}
      </button>
    </form>
  );
};

export default function PlatformPanel() {
  const [p, setP] = useState<Preview | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [mail, setMail] = useState(true);
  const [logs, setLogs] = useState(true);
  const [typed, setTyped] = useState("");
  const [launchTyped, setLaunchTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ResetResult | null>(null);

  const load = useCallback(() => {
    call<Preview>({ action: "preview" }).then((d) => { setP(d); setErr(null); }).catch((e) => setErr(e.message));
  }, []);
  useEffect(load, [load]);

  const run = async (body: Record<string, unknown>, after: (r: unknown) => void) => {
    setBusy(true); setErr(null);
    try { after(await call(body)); load(); } catch (e) { setErr((e as Error).message); }
    setBusy(false);
  };

  const launched = !!p?.launchedAt;
  const orders = p?.core.find((c) => c.table === "orders")?.n ?? 0;
  const linked = p ? sum(p.core.filter((c) => c.table !== "orders")) : 0;
  const total = p ? sum(p.core) + (mail ? sum(p.mail) : 0) + (logs ? sum(p.logs) : 0) : 0;

  return (
    <div style={{ display: "grid", gap: 16, fontFamily: FONT, maxWidth: 980 }}>
      <AdminHero
        eyebrow="État"
        loading={!p}
        value={launched ? "Activités démarrées" : "En test"}
        size={34}
        stats={p ? (launched
          ? [{ label: "Depuis le", value: fmtDate(p.launchedAt!) }]
          : [
            { label: "Commandes", value: orders },
            { label: "Remise à zéro", value: p.lastResetAt ? new Date(p.lastResetAt).toLocaleDateString("fr-CA", { day: "numeric", month: "short" }) : "Jamais" },
          ]) : []}
      />

      {err && (
        <div style={{ ...card, padding: "12px 16px", borderColor: C.dangerBd, background: C.dangerBg, color: C.dangerText, fontSize: 13 }}>{err}</div>
      )}

      {result && (
        <div style={{ ...card, padding: "14px 18px", display: "flex", alignItems: "center", gap: 12, borderColor: C.successBd, background: C.successBg }}>
          <Check style={{ width: 16, height: 16, color: C.successText, flexShrink: 0 }} strokeWidth={2.2} />
          <p style={{ margin: 0, fontSize: 13, color: C.successText, flex: 1 }}>
            {result.tables.orders ?? 0} commandes de test effacées.
            {result.keptOrders > 0 && ` ${result.keptOrders} gardée(s), citée(s) par le registre de conformité.`}
          </p>
          <button type="button" onClick={() => window.location.reload()}
            style={{ background: "none", border: "none", color: C.successText, fontSize: 12, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 5, fontFamily: FONT }}>
            <RotateCcw style={{ width: 12, height: 12 }} /> Recharger
          </button>
        </div>
      )}

      {p && !launched && (
        <div style={card}>
          <div style={cardHeaderRow}>
            <div>
              <p style={cardTitle}>Remettre les commandes à zéro</p>
              <p style={cardSubtitle}>Pour partir propre au lancement. Autant de fois que vous voulez d'ici là.</p>
            </div>
            <Eraser style={{ width: 16, height: 16, color: C.t3 }} strokeWidth={1.8} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
            {/* Effacé */}
            <div style={{ borderRight: `1px solid ${C.bds}` }}>
              <p style={{ ...sH, padding: "16px 18px 8px" }}>Effacé</p>
              <div style={{ ...listRowStyle(false), display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ flex: 1, fontSize: 13, color: C.t1 }}>Commandes et leur historique</span>
                <Num n={orders} />
              </div>
              <div style={{ ...listRowStyle(false), display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ flex: 1, fontSize: 13, color: C.t1 }}>
                  Virements reçus, envois USDT, dépôts reçus
                </span>
                <Num n={linked} />
              </div>
              <div style={{ ...listRowStyle(false), display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ flex: 1 }}>
                  <span style={{ display: "block", fontSize: 13, color: mail ? C.t1 : C.t3 }}>Messagerie</span>
                  <span style={{ display: "block", fontSize: 11.5, color: C.t3, marginTop: 2 }}>{sum(p.mail)} conversations. Décochez si un vrai contact y figure.</span>
                </span>
                <Switch on={mail} onChange={setMail} label="Effacer aussi la messagerie" />
              </div>
              <div style={{ ...listRowStyle(true), display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ flex: 1 }}>
                  <span style={{ display: "block", fontSize: 13, color: logs ? C.t1 : C.t3 }}>Journaux</span>
                  <span style={{ display: "block", fontSize: 11.5, color: C.t3, marginTop: 2 }}>{sum(p.logs)} entrées : activité de l'équipe, assistant IA.</span>
                </span>
                <Switch on={logs} onChange={setLogs} label="Effacer aussi les journaux" />
              </div>
            </div>

            {/* Gardé */}
            <div>
              <p style={{ ...sH, padding: "16px 18px 8px" }}>Toujours gardé</p>
              {KEPT.map((k, i) => (
                <div key={k} style={{ ...listRowStyle(i === KEPT.length - 1), display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: C.t2 }}>
                  <Lock style={{ width: 13, height: 13, color: C.t3, flexShrink: 0 }} strokeWidth={1.8} />
                  {k}
                </div>
              ))}
            </div>
          </div>

          <div style={{ padding: "16px 18px", borderTop: `1px solid ${C.bds}`, display: "grid", gap: 10 }}>
            <p style={{ margin: 0, fontSize: 12, color: C.t3 }}>
              {total} éléments seront effacés. Cette action ne peut pas être annulée.
              {p.keptOrders > 0 && ` ${p.keptOrders} commande(s) citée(s) par le registre de conformité seront gardées.`}
            </p>
            <Confirm
              word="RÉINITIALISER" value={typed} onChange={setTyped} busy={busy} disabled={total === 0} danger
              label="Remettre à zéro"
              onSubmit={() => run({ action: "reset", confirm: typed, mail, logs }, (r) => { setResult(r as ResetResult); setTyped(""); })}
            />
          </div>
        </div>
      )}

      {p && (
        <div style={card}>
          <div style={cardHeaderRow}>
            <div>
              <p style={cardTitle}>Démarrer les activités</p>
              <p style={cardSubtitle}>Une seule fois, le jour où les vrais clients arrivent.</p>
            </div>
            <Power style={{ width: 16, height: 16, color: C.t3 }} strokeWidth={1.8} />
          </div>
          <div style={{ padding: "16px 18px", display: "grid", gap: 14 }}>
            {launched ? (
              <p style={{ margin: 0, fontSize: 13, color: C.t2, lineHeight: 1.6 }}>
                Lancée le {fmtDate(p.launchedAt!)}. Chaque commande fait maintenant partie du registre des opérations et se
                conserve au moins 5 ans (CANAFE) : la remise à zéro n'existe plus.
              </p>
            ) : (
              <>
                <div style={{ display: "grid", gap: 8 }}>
                  <Step n={1} done={orders === 0}>Remettre les commandes de test à zéro</Step>
                  <Step n={2} done={false}>Démarrer les activités</Step>
                </div>
                <p style={{ margin: 0, fontSize: 12, color: C.t3, lineHeight: 1.6 }}>
                  Après ce clic, la remise à zéro disparaît pour toujours et plus personne, serveur compris, ne peut effacer
                  une commande payée.
                </p>
                <Confirm
                  word="DÉMARRER" value={launchTyped} onChange={setLaunchTyped} busy={busy} disabled={false}
                  label="Démarrer les activités"
                  onSubmit={() => run({ action: "launch", confirm: launchTyped }, () => setLaunchTyped(""))}
                />
              </>
            )}
          </div>
        </div>
      )}

      <BackupsCard />
    </div>
  );
}
