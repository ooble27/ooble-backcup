import { useCallback, useEffect, useState } from "react";
import { Check, Lock, RotateCcw } from "lucide-react";
import { peek } from "@/lib/adminCache";
import { loadPlatformPreview, resetTestData } from "@/lib/adminData";
import BackupsCard from "@/components/admin/BackupsCard";
import { C, FONT } from "@/components/admin/adminTheme";
import { Button, Notice, Switch, TextInput } from "@/components/admin/ui";
import { Section, StatStrip } from "@/components/admin/layout";

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

const call = resetTestData;

/** Ligne de liste à plat : libellé, détail, valeur à droite. */
const Line = ({ children, right, muted }: { children: React.ReactNode; right?: React.ReactNode; muted?: boolean }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 0", borderBottom: `1px solid ${C.bds}`, fontSize: 13.5, color: muted ? C.t3 : C.t1 }}>
    <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
    {right}
  </div>
);

const Num = ({ n }: { n: number }) => (
  <span style={{ fontVariantNumeric: "tabular-nums", color: n ? C.t1 : C.t3 }}>{n}</span>
);

/** Champ de confirmation : le mot à taper, puis le bouton. */
const Confirm = ({ word, value, onChange, onSubmit, disabled, busy, label, danger }: {
  word: string; value: string; onChange: (v: string) => void; onSubmit: () => void;
  disabled: boolean; busy: boolean; label: string; danger?: boolean;
}) => {
  const ready = plain(value) === plain(word) && !disabled && !busy;
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (ready) onSubmit(); }} style={{ display: "flex", gap: 8, flexWrap: "wrap", maxWidth: 560 }}>
      <TextInput
        value={value} onChange={(e) => onChange(e.target.value)} placeholder={`Tapez ${word}`} aria-label={`Tapez ${word} pour confirmer`}
        autoComplete="off" spellCheck={false} style={{ flex: "1 1 220px", width: "auto", letterSpacing: "0.06em" }}
      />
      <Button type="submit" variant={danger ? "danger" : "primary"} disabled={!ready}>{busy ? "Un instant…" : label}</Button>
    </form>
  );
};

export default function PlatformPanel() {
  const [p, setP] = useState<Preview | null>(() => peek<Preview>("pf.preview")?.value ?? null);
  const [err, setErr] = useState<string | null>(null);
  const [mail, setMail] = useState(true);
  const [logs, setLogs] = useState(true);
  const [typed, setTyped] = useState("");
  const [launchTyped, setLaunchTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ResetResult | null>(null);

  const load = useCallback(() => {
    loadPlatformPreview<Preview>().then((d) => { setP(d); setErr(null); }).catch((e) => setErr(e.message));
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
    <div style={{ fontFamily: FONT }}>
      <StatStrip items={!p ? [{ label: "État", value: "…" }] : launched ? [
        { label: "État", value: "Activités démarrées", tone: "ok" },
        { label: "Depuis le", value: fmtDate(p.launchedAt!) },
        { label: "Conservation", value: "5 ans", hint: "registre des opérations (CANAFE)" },
      ] : [
        { label: "État", value: "En test", tone: "warn" },
        { label: "Commandes de test", value: orders },
        { label: "Remise à zéro", value: p.lastResetAt ? new Date(p.lastResetAt).toLocaleDateString("fr-CA", { day: "numeric", month: "short" }) : "Jamais" },
      ]} />

      {err && <div style={{ marginTop: 16 }}><Notice tone="err">{err}</Notice></div>}

      {result && (
        <div style={{ marginTop: 16 }}>
          <Notice tone="ok">
            <span style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <Check style={{ width: 15, height: 15 }} strokeWidth={2.2} />
              <span style={{ flex: 1 }}>
                {result.tables.orders ?? 0} commandes de test effacées.
                {result.keptOrders > 0 && ` ${result.keptOrders} gardée(s), citée(s) par le registre de conformité.`}
              </span>
              <Button size="sm" variant="ghost" icon={<RotateCcw style={{ width: 13, height: 13 }} />} onClick={() => window.location.reload()}>Recharger</Button>
            </span>
          </Notice>
        </div>
      )}

      {p && !launched && (
        <Section title="Remettre les commandes à zéro" description="Pour partir propre au lancement. Autant de fois que vous voulez d'ici là.">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 300px), 1fr))", gap: "8px 48px" }}>
            <div>
              <p style={{ margin: "0 0 4px", fontSize: 12.5, color: C.t3 }}>Effacé</p>
              <div style={{ borderTop: `1px solid ${C.bds}` }}>
                <Line right={<Num n={orders} />}>Commandes et leur historique</Line>
                <Line right={<Num n={linked} />}>Virements reçus, envois USDT, dépôts reçus</Line>
                <Line>
                  <Switch checked={mail} onChange={setMail} label="Messagerie"
                    hint={`${sum(p.mail)} conversations. Décochez si un vrai contact y figure.`} />
                </Line>
                <Line>
                  <Switch checked={logs} onChange={setLogs} label="Journaux"
                    hint={`${sum(p.logs)} entrées : activité de l'équipe, assistant IA.`} />
                </Line>
              </div>
            </div>
            <div>
              <p style={{ margin: "0 0 4px", fontSize: 12.5, color: C.t3 }}>Toujours gardé</p>
              <div style={{ borderTop: `1px solid ${C.bds}` }}>
                {KEPT.map((k) => (
                  <Line key={k} muted>
                    <span style={{ display: "flex", alignItems: "center", gap: 10, color: C.t2 }}>
                      <Lock style={{ width: 13, height: 13, color: C.t3, flexShrink: 0 }} strokeWidth={1.8} />{k}
                    </span>
                  </Line>
                ))}
              </div>
            </div>
          </div>
          <p style={{ margin: "20px 0 10px", fontSize: 12.5, color: C.t3 }}>
            {total} éléments seront effacés. Cette action ne peut pas être annulée.
            {p.keptOrders > 0 && ` ${p.keptOrders} commande(s) citée(s) par le registre de conformité seront gardées.`}
          </p>
          <Confirm
            word="RÉINITIALISER" value={typed} onChange={setTyped} busy={busy} disabled={total === 0} danger
            label="Remettre à zéro"
            onSubmit={() => run({ action: "reset", confirm: typed, mail, logs }, (r) => { setResult(r as ResetResult); setTyped(""); })}
          />
        </Section>
      )}

      {p && (
        <Section title="Démarrer les activités" description={launched ? undefined : "Une seule fois, le jour où les vrais clients arrivent."}>
          {launched ? (
            <p style={{ margin: 0, fontSize: 13.5, color: C.t2, lineHeight: 1.65, maxWidth: 680 }}>
              Lancée le {fmtDate(p.launchedAt!)}. Chaque commande fait maintenant partie du registre des opérations et se
              conserve au moins 5 ans (CANAFE) : la remise à zéro n'existe plus.
            </p>
          ) : (
            <div style={{ display: "grid", gap: 14 }}>
              <ol style={{ margin: 0, paddingLeft: 20, listStyle: "decimal", fontSize: 13.5, lineHeight: 1.8, color: C.t2 }}>
                <li style={{ color: orders === 0 ? C.t1 : C.t2 }}>Remettre les commandes de test à zéro {orders === 0 && <Check style={{ width: 13, height: 13, verticalAlign: -2, color: C.successText }} />}</li>
                <li>Démarrer les activités</li>
              </ol>
              <p style={{ margin: 0, fontSize: 12.5, color: C.t3, lineHeight: 1.6, maxWidth: 640 }}>
                Après ce clic, la remise à zéro disparaît pour toujours et plus personne, serveur compris, ne peut effacer
                une commande payée.
              </p>
              <Confirm
                word="DÉMARRER" value={launchTyped} onChange={setLaunchTyped} busy={busy} disabled={false}
                label="Démarrer les activités"
                onSubmit={() => run({ action: "launch", confirm: launchTyped }, () => setLaunchTyped(""))}
              />
            </div>
          )}
        </Section>
      )}

      <BackupsCard />
    </div>
  );
}
