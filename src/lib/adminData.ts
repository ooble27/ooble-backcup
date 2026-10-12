/**
 * Chargements du back-office passés par le cache (voir adminCache) : Règlement auto et Plateforme.
 * Le portail les précharge en arrière-plan ; les pages s'ouvrent alors avec les données déjà là.
 */
import { supabase } from "@/integrations/supabase/client";
import { fetchCached, prefetch } from "./adminCache";
import { fetchDeposits, fetchPayouts, fetchReceipts, fetchScanState, fetchWallets } from "./settlement";
import { fetchKyc } from "./adminKyc";
import { fetchKyb } from "./adminKyb";
import { fetchTeam } from "./adminTeam";
import { fetchThreads } from "./mailThreads";
import { fetchClientDirectory } from "./adminClient";
import { fetchAlerts, fetchChecklist, fetchDeclarations } from "./complianceLive";

/** Appel de la fonction « reset-test-data » (aperçu, réinitialisation, lancement). */
export async function resetTestData<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("reset-test-data", { body });
  if (error) {
    const res = (error as { context?: Response }).context;
    const detail = res ? await res.json().catch(() => null) : null;
    throw new Error(detail?.message ?? detail?.error ?? error.message);
  }
  return data as T;
}

type Wallets = Awaited<ReturnType<typeof fetchWallets>>;

// Soldes et compteurs : sans renseignements personnels, gardés aussi pour la prochaine ouverture.
export const loadWallets = () => fetchCached<Wallets>("st.wallets", fetchWallets, { persist: true, keep: (w) => !!w.ok });
export const loadScanState = () => fetchCached("st.scan", fetchScanState, { persist: true });
// Virements, envois et dépôts : noms et adresses des clients, gardés en mémoire seulement.
export const loadReceipts = () => fetchCached("st.receipts", () => fetchReceipts());
export const loadPayouts = () => fetchCached("st.payouts", () => fetchPayouts());
export const loadDeposits = () => fetchCached("st.deposits", () => fetchDeposits());

export const loadPlatformPreview = <T,>() => fetchCached<T>("pf.preview", () => resetTestData<T>({ action: "preview" }), { persist: true });
export const loadBackupRuns = <T,>() => fetchCached<T[]>("pf.backups", async () => {
  const { data } = await supabase.from("backup_runs" as never).select("*").order("started_at", { ascending: false }).limit(10);
  return ((data ?? []) as unknown) as T[];
}, { persist: true });

/** Préchargement discret, selon les onglets auxquels la personne a accès. */
export function prefetchAdmin(tabs: { settlement: boolean; platform: boolean; kyc?: boolean; clients?: boolean; compliance?: boolean; mailbox?: boolean; team?: boolean; campaigns?: boolean }) {
  // Listes avec données clients : en mémoire pour la session seulement.
  if (tabs.kyc) { prefetch("kyc", fetchKyc); prefetch("kyb", fetchKyb); }
  if (tabs.clients) prefetch("clients.admin", async () => {
    const { data, error } = await supabase.rpc("admin_clients" as never);
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown[];
  });
  if (tabs.compliance) prefetch("cmp", async () => {
    const [a, d, c] = await Promise.all([fetchAlerts(), fetchDeclarations(), fetchChecklist()]);
    return { a, d, c };
  });
  if (tabs.mailbox) prefetch("mail.threads", fetchThreads);
  if (tabs.team) prefetch("team", fetchTeam);
  if (tabs.campaigns) prefetch("clients.directory2000", () => fetchClientDirectory(2000));
  if (tabs.settlement) {
    prefetch("st.wallets", fetchWallets, { persist: true, keep: (w) => !!w.ok });
    prefetch("st.scan", fetchScanState, { persist: true });
    prefetch("st.receipts", () => fetchReceipts());
    prefetch("st.payouts", () => fetchPayouts());
    prefetch("st.deposits", () => fetchDeposits());
  }
  if (tabs.platform) {
    prefetch("pf.preview", () => resetTestData({ action: "preview" }), { persist: true, maxAgeMs: 5 * 60_000 });
    prefetch("pf.backups", async () => {
      const { data } = await supabase.from("backup_runs" as never).select("*").order("started_at", { ascending: false }).limit(10);
      return (data ?? []) as unknown[];
    }, { persist: true, maxAgeMs: 5 * 60_000 });
  }
}
