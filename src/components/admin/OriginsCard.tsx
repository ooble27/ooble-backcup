import { useEffect, useMemo, useState } from "react";
import { fetchOrigins, regionName, countryName, type SignupOrigin } from "@/lib/origin";
import { C, numeric } from "./adminTheme";
import { FilterChips } from "./layout";

/*
 * Tableau de bord : d'où viennent les inscrits. Deux listes, lieux (province
 * au Canada, pays ailleurs, ou villes) et sources (Google, WhatsApp, lien de
 * campagne…), en part du total.
 */

type Tab = "regions" | "cities" | "sources";

function top(rows: SignupOrigin[], key: (o: SignupOrigin) => string | null, n = 6) {
  const counts = new Map<string, number>();
  for (const o of rows) {
    const k = key(o) ?? "Inconnu";
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
}

const OriginsCard = () => {
  const [rows, setRows] = useState<SignupOrigin[] | null>(null);
  const [tab, setTab] = useState<Tab>("regions");

  useEffect(() => { fetchOrigins().then(setRows); }, []);

  const list = useMemo(() => {
    if (!rows) return [];
    if (tab === "sources") return top(rows, (o) => o.source);
    if (tab === "cities") return top(rows, (o) => o.city);
    return top(rows, (o) => (o.country === "CA" ? regionName(o) : countryName(o.country)));
  }, [rows, tab]);
  const total = rows?.length ?? 0;

  const tabs: { id: Tab; fr: string; en: string }[] = [
    { id: "regions", fr: "Provinces", en: "Provinces" },
    { id: "cities", fr: "Villes", en: "Cities" },
    { id: "sources", fr: "Sources", en: "Sources" },
  ];

  return (
    <div>
      <FilterChips value={tab} onChange={setTab} options={tabs.map((t) => ({ id: t.id, label: t.fr }))} />
      {!rows ? (
        <p style={{ fontSize: 13, color: C.t3, margin: 0, padding: "24px 0" }}>Chargement…</p>
      ) : total === 0 ? (
        <p style={{ fontSize: 13, color: C.t3, margin: 0, padding: "24px 0", lineHeight: 1.6 }}>
          Pas encore de données : chaque nouvelle inscription est enregistrée à partir de maintenant.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-x-12 md:grid-cols-2" style={{ marginTop: 12, borderTop: `1px solid ${C.bds}` }}>
            {list.map(([label, n]) => {
              const pct = (n / total) * 100;
              return (
                <div key={label} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 110px 76px", gap: 14, alignItems: "center", padding: "11px 0", borderBottom: `1px solid ${C.bds}` }}>
                  <span style={{ fontSize: 13.5, color: C.t1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
                  <span style={{ height: 4, borderRadius: 99, background: C.hover3, overflow: "hidden" }}>
                    <span style={{ display: "block", height: "100%", width: `${Math.max(2, pct)}%`, background: C.t1, borderRadius: 99 }} />
                  </span>
                  <span style={{ fontSize: 13, color: C.t2, textAlign: "right", ...numeric }}>{n} · {pct.toFixed(0)} %</span>
                </div>
              );
            })}
          </div>
          <p style={{ margin: "10px 0 0", fontSize: 12, color: C.t3 }}>{total} inscriptions dont l'origine est connue.</p>
        </>
      )}
    </div>
  );
};

export default OriginsCard;
