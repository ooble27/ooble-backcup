/**
 * Au démarrage du back-office : chaque page à laquelle la personne a accès est lue d'avance, en arrière-plan
 * et par petits paquets, puis gardée en mémoire. En ouvrant une page, ses données sont déjà là ; la lecture
 * fraîche arrive ensuite par-dessus, sans écran de chargement.
 * Rien n'est modifié ni marqué comme lu : ce ne sont que des lectures.
 */
import type { TabId } from "@/lib/roles";
import { prefetch } from "@/lib/adminCache";
import { loadTreasury } from "@/lib/ledger";
import { listAnnouncements, listMaintenanceWindows } from "@/lib/announcements";
import { fetchCampaignOrders, fetchDaily, fetchOverview, fetchSummaries, listCampaigns, loadMarketingSettings } from "@/lib/marketing";
import { loadNotifications } from "@/lib/notifications";
import { loadOwnTemplates } from "@/lib/notifTemplates";
import { listAudiences } from "@/lib/audiences";
import { fetchPlatformHealth } from "@/lib/adminTools";
import { fetchRegisterStats, fetchSanctionStatus } from "@/lib/complianceLive";
import { fetchAuditFacets, fetchAuditLog } from "@/lib/audit";
import { fetchDocs } from "@/lib/kb";
import { fetchSnapshot } from "./KpiDashboard";
import { CAL_PAST } from "./MarketingPanels";
import { PAGE_SIZE } from "./AuditLogPanel";
import { loadApprovals } from "./TeamApprovals";

const DAY = 86_400_000;
const quiet = (p: Promise<unknown>) => { void p.catch(() => undefined); };

export function warmPages(allowed: Set<TabId>) {
  const steps: (() => void)[] = [];
  const has = (t: TabId) => allowed.has(t);

  // Mon espace : les demandes d'approbation.
  if (has("me")) steps.push(() => quiet(loadApprovals()));
  // Tableau de bord : la période ouverte par défaut (aujourd'hui).
  if (has("dashboard")) steps.push(() => prefetch("kpi.1", () => fetchSnapshot(1), { persist: true }));
  if (has("treasury")) steps.push(() => quiet(loadTreasury()));
  if (has("compliance")) steps.push(() => {
    prefetch("cmp.stats", fetchRegisterStats);
    prefetch("cmp.sanctions", fetchSanctionStatus);
  });
  if (has("announcements")) steps.push(() => prefetch("announcements", async () => {
    const [a, m] = await Promise.all([listAnnouncements(), listMaintenanceWindows()]);
    return { a, m };
  }));
  if (has("campaigns")) {
    steps.push(() => {
      prefetch("mk.settings", loadMarketingSettings);
      prefetch("mk.ov.30", () => fetchOverview(new Date(Date.now() - 30 * DAY)));
      prefetch("mk.days", () => fetchDaily(new Date(Date.now() - (CAL_PAST * 7 + 7) * DAY)));
    });
    steps.push(() => {
      prefetch("mk.list", listCampaigns);
      prefetch("mk.sums", fetchSummaries);
      prefetch("mk.gains", fetchCampaignOrders);
    });
    steps.push(() => {
      prefetch("nt.all", loadNotifications);
      prefetch("nt.own", loadOwnTemplates);
      prefetch("mk.audiences", listAudiences);
    });
  }
  // Journal d'audit (onglet Équipe, administrateurs) : la première page et les filtres.
  if (has("team")) steps.push(() => {
    prefetch("audit.p0", () => fetchAuditLog({ limit: PAGE_SIZE, offset: 0 }));
    prefetch("audit.facets", fetchAuditFacets);
  });
  // Réglages : l'état des tâches planifiées (pas l'usage des courriels, limité par le fournisseur).
  if (has("platform")) steps.push(() => prefetch("st.health", fetchPlatformHealth));
  // Documentation : chaque section consultable.
  const docs: [TabId, "kb" | "manual" | "tech"][] = [["kb", "kb"], ["manual", "manual"], ["techdocs", "tech"]];
  const open = docs.filter(([t]) => has(t));
  if (open.length) steps.push(() => open.forEach(([, s]) => prefetch(`docs.${s}`, () => fetchDocs(s))));

  // Par petits paquets, pour ne jamais ralentir la page ouverte.
  const timers = steps.map((run, i) => window.setTimeout(run, i * 350));
  return () => timers.forEach((t) => window.clearTimeout(t));
}
