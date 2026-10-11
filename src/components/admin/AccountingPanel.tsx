import { useMemo } from "react";
import { Download } from "lucide-react";
import { NETWORKS } from "@/components/app/networks";
import { nfCad, nfUsdt, type AdminOrder } from "@/lib/adminOrders";
import { C } from "./adminTheme";
import { Button } from "./ui";
import { DataTable, Section, StatStrip, type Column } from "./layout";

const MARGIN = 0.02; // marché + 2 %

interface Month { key: string; label: string; buy: number; sell: number; buyN: number; sellN: number }
interface Net { id: string; name: string; volume: number; usdt: number; n: number }

const money = (n: number) => `${nfCad.format(n)} $`;

const AccountingPanel = ({ orders }: { orders: AdminOrder[] }) => {
  const done = useMemo(() => orders.filter((o) => o.status === "termine"), [orders]);
  const stats = useMemo(() => {
    const volume = done.reduce((s, o) => s + o.cad, 0);
    const buys = done.filter((o) => o.type === "buy");
    const sells = done.filter((o) => o.type === "sell");
    return {
      count: done.length, volume, margin: volume * MARGIN, avg: done.length ? volume / done.length : 0,
      buyVol: buys.reduce((s, o) => s + o.cad, 0), sellVol: sells.reduce((s, o) => s + o.cad, 0), buyN: buys.length, sellN: sells.length,
    };
  }, [done]);

  const months = useMemo<Month[]>(() => {
    const m = new Map<string, Month>();
    for (const o of done) {
      const d = new Date(Date.now() - o.createdMinsAgo * 60000);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const row = m.get(key) ?? { key, label: d.toLocaleDateString("fr-CA", { month: "long", year: "numeric" }), buy: 0, sell: 0, buyN: 0, sellN: 0 };
      if (o.type === "buy") { row.buy += o.cad; row.buyN += 1; } else { row.sell += o.cad; row.sellN += 1; }
      m.set(key, row);
    }
    return [...m.values()].sort((a, b) => b.key.localeCompare(a.key));
  }, [done]);

  const nets = useMemo<Net[]>(() => {
    const m = new Map<string, Net>();
    for (const o of done) {
      const id = o.type === "sell" && !o.network ? "interac" : o.network ?? "autre";
      const name = NETWORKS.find((n) => n.id === id)?.name ?? (id === "interac" ? "Interac" : "Autre");
      const row = m.get(id) ?? { id, name, volume: 0, usdt: 0, n: 0 };
      row.volume += o.cad; row.usdt += o.usdt; row.n += 1;
      m.set(id, row);
    }
    return [...m.values()].sort((a, b) => b.volume - a.volume);
  }, [done]);

  const exportCsv = () => {
    const head = ["Mois", "Achats CAD", "Achats (nb)", "Ventes CAD", "Ventes (nb)", "Volume CAD", "Revenus estimés CAD"];
    const lines = months.map((r) => [r.key, r.buy.toFixed(2), r.buyN, r.sell.toFixed(2), r.sellN, (r.buy + r.sell).toFixed(2), ((r.buy + r.sell) * MARGIN).toFixed(2)].join(";"));
    const url = URL.createObjectURL(new Blob(["﻿" + [head.join(";"), ...lines].join("\r\n")], { type: "text/csv;charset=utf-8" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: `ooble-comptabilite-${new Date().toISOString().slice(0, 10)}.csv` });
    a.click();
    URL.revokeObjectURL(url);
  };

  const monthCols: Column<Month>[] = [
    { key: "m", header: "Mois", render: (r) => <span style={{ textTransform: "capitalize" }}>{r.label}</span> },
    { key: "buy", header: "Achats", align: "right", render: (r) => <span>{money(r.buy)} <span style={{ color: C.t3 }}>· {r.buyN}</span></span> },
    { key: "sell", header: "Ventes", align: "right", render: (r) => <span>{money(r.sell)} <span style={{ color: C.t3 }}>· {r.sellN}</span></span> },
    { key: "vol", header: "Volume", align: "right", sort: (r) => r.buy + r.sell, render: (r) => money(r.buy + r.sell) },
    { key: "rev", header: "Revenus estimés", align: "right", render: (r) => <span style={{ color: C.successText }}>{money((r.buy + r.sell) * MARGIN)}</span> },
  ];
  const netCols: Column<Net>[] = [
    { key: "n", header: "Réseau", render: (r) => (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
        {NETWORKS.some((n) => n.id === r.id) && <img src={`/coins/${r.id}.svg`} alt="" width={18} height={18} style={{ borderRadius: 99 }} />}
        {r.name}
      </span>
    ) },
    { key: "c", header: "Commandes", align: "right", render: (r) => r.n },
    { key: "u", header: "USDT", align: "right", render: (r) => nfUsdt.format(r.usdt) },
    { key: "v", header: "Volume", align: "right", render: (r) => money(r.volume) },
    { key: "p", header: "Part", align: "right", hideBelow: 700, render: (r) => <span style={{ color: C.t2 }}>{stats.volume ? Math.round((r.volume / stats.volume) * 100) : 0} %</span> },
  ];

  return (
    <div>
      <StatStrip items={[
        { label: "Revenus estimés", value: money(stats.margin), tone: "ok", hint: `marge de ${nfUsdt.format(MARGIN * 100)} % sur le volume` },
        { label: "Volume traité", value: money(stats.volume), hint: `${stats.count} commande${stats.count > 1 ? "s" : ""} terminée${stats.count > 1 ? "s" : ""}` },
        { label: "Achats", value: money(stats.buyVol), hint: `${stats.buyN} commande${stats.buyN > 1 ? "s" : ""}` },
        { label: "Ventes", value: money(stats.sellVol), hint: `${stats.sellN} commande${stats.sellN > 1 ? "s" : ""}` },
        { label: "Panier moyen", value: money(stats.avg) },
      ]} />

      <Section title="Par mois" description="Commandes terminées, regroupées par mois de création." actions={<Button size="sm" variant="ghost" onClick={exportCsv} disabled={!months.length} icon={<Download style={{ width: 14, height: 14 }} />}>Exporter pour la comptabilité</Button>}>
        <DataTable rows={months} columns={monthCols} rowKey={(r) => r.key} empty={<p style={{ padding: "28px 0", margin: 0, fontSize: 13.5, color: C.t3 }}>Aucune commande terminée pour l'instant.</p>} />
      </Section>

      <Section title="Par réseau">
        <DataTable rows={nets} columns={netCols} rowKey={(r) => r.id} empty={<p style={{ padding: "28px 0", margin: 0, fontSize: 13.5, color: C.t3 }}>Aucune donnée.</p>} />
      </Section>

      <p style={{ margin: "20px 0 0", fontSize: 12.5, color: C.t3, lineHeight: 1.6, maxWidth: 720 }}>
        Les revenus sont une estimation (marge de {nfUsdt.format(MARGIN * 100)} %) ; les montants définitifs viennent du rapprochement des virements Interac et des envois d'USDT.
      </p>
    </div>
  );
};

export default AccountingPanel;
