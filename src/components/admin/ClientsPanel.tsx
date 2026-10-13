import { useEffect, useMemo, useState } from "react";
import { fetchCached, peek } from "@/lib/adminCache";
import { fetchAdminClients } from "@/lib/adminData";
import { Download, Users } from "lucide-react";
import { nfCad } from "@/lib/adminOrders";
import { regionName, countryName } from "@/lib/origin";
import { C, FONT } from "./adminTheme";
import { Button } from "./ui";
import { prefetchClient } from "@/lib/clientProfileCache";
import { Avatar, DataTable, EmptyState, Pill, SearchField, Tabs, Toolbar, TwoLine, type Column, type Tone } from "./layout";
import { ClientsPopulation } from "./viz";

/*
 * Back-office, onglet Clients : tous les inscrits, avec leur vérification,
 * leur lieu et leur source d'inscription, leurs commandes et leur dernière
 * connexion. Recherche, filtres, tri, export CSV ; un clic ouvre la fiche.
 * Données : fonction admin_clients (réservée à l'équipe).
 */

interface Client {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  account_type: string;
  business_name: string | null;
  kyc_status: string;
  business_status: string | null;
  created_at: string;
  closed_at: string | null;
  is_staff: boolean;
  orders: number;
  completed: number;
  volume_cad: number;
  last_order_at: string | null;
  last_sign_in_at: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
  source: string | null;
  origin_late: boolean | null;
}

type Filter = "all" | "verified" | "pending" | "unverified" | "business" | "buyers" | "staff";
type Sort = "recent" | "volume" | "active" | "name";

const VERIF: Record<string, [string, Tone]> = {
  approved: ["Vérifiée", "ok"],
  pending: ["En attente", "warn"],
  rejected: ["Refusée", "danger"],
  not_started: ["Non commencée", "neutral"],
};

const day = new Intl.DateTimeFormat("fr-CA", { day: "numeric", month: "short", year: "numeric" });
function ago(iso: string | null): string {
  if (!iso) return "Jamais";
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 60) return `il y a ${Math.max(1, m)} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `il y a ${h} h`;
  const d = Math.round(h / 24);
  return d < 60 ? `il y a ${d} j` : day.format(new Date(iso));
}
const nameOf = (c: Client) => (c.account_type === "business" && c.business_name ? c.business_name : c.full_name) || c.email || "Sans nom";
const verifOf = (c: Client) => (c.account_type === "business" ? c.business_status ?? "not_started" : c.kyc_status);
const sourceOf = (c: Client) =>
  c.source && !c.source.startsWith("Inconnue") ? c.source.charAt(0).toUpperCase() + c.source.slice(1) : null;
const placeOf = (c: Client) => {
  const reg = c.country === "CA" ? regionName({ country: c.country, region: c.region }) : countryName(c.country);
  return [c.city, reg].filter(Boolean).join(", ") || null;
};

function toCsv(rows: Client[]): string {
  const head = ["Nom", "Courriel", "Téléphone", "Type", "Vérification", "Ville", "Province / pays", "Source", "Commandes", "Terminées", "Volume CAD", "Inscription", "Dernière connexion"];
  const q = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = rows.map((c) => [
    nameOf(c), c.email, c.phone, c.account_type === "business" ? "Entreprise" : "Particulier", VERIF[verifOf(c)]?.[0] ?? verifOf(c),
    c.city, c.country === "CA" ? regionName(c) : countryName(c.country), c.source, c.orders, c.completed, Number(c.volume_cad).toFixed(2),
    c.created_at.slice(0, 10), c.last_sign_in_at?.slice(0, 16).replace("T", " ") ?? "",
  ].map(q).join(","));
  return "﻿" + [head.map(q).join(","), ...lines].join("\n");
}

export default function ClientsPanel({ onOpen }: { onOpen: (userId: string, name: string) => void }) {
  const [rows, setRows] = useState<Client[] | null>(() => peek<Client[]>("clients.admin")?.value ?? null);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [region, setRegion] = useState("all");
  const [sort, setSort] = useState<Sort>("recent");

  useEffect(() => {
    // Mémoire de la session seulement : la liste revient instantanément, puis se met à jour.
    fetchCached("clients.admin", () => fetchAdminClients<Client>()).then(setRows).catch((e: Error) => setErr(e.message));
  }, []);

  const all = rows ?? [];
  const clients = all.filter((c) => !c.is_staff);

  const filters: { id: Filter; label: string; test: (c: Client) => boolean }[] = [
    { id: "all", label: "Tous", test: (c) => !c.is_staff },
    { id: "verified", label: "Vérifiés", test: (c) => !c.is_staff && verifOf(c) === "approved" },
    { id: "pending", label: "En attente", test: (c) => !c.is_staff && verifOf(c) === "pending" },
    { id: "unverified", label: "Non vérifiés", test: (c) => !c.is_staff && ["not_started", "rejected"].includes(verifOf(c)) },
    { id: "business", label: "Entreprises", test: (c) => !c.is_staff && c.account_type === "business" },
    { id: "buyers", label: "Ont commandé", test: (c) => !c.is_staff && c.orders > 0 },
    { id: "staff", label: "Équipe", test: (c) => c.is_staff },
  ];

  const regions = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of all) {
      const key = c.country === "CA" ? `CA:${c.region ?? ""}` : c.country ? `X:${c.country}` : "";
      if (!key || m.has(key)) continue;
      m.set(key, c.country === "CA" ? (regionName(c) ?? "Canada") : (countryName(c.country) ?? c.country ?? ""));
    }
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], "fr"));
  }, [all]);

  const list = useMemo(() => {
    const f = filters.find((x) => x.id === filter)!.test;
    const needle = q.trim().toLowerCase();
    const out = all.filter(f).filter((c) => {
      if (region !== "all") {
        const key = c.country === "CA" ? `CA:${c.region ?? ""}` : c.country ? `X:${c.country}` : "";
        if (key !== region) return false;
      }
      if (!needle) return true;
      return [c.full_name, c.business_name, c.email, c.phone, c.city, c.source].some((v) => v?.toLowerCase().includes(needle));
    });
    const by: Record<Sort, (a: Client, b: Client) => number> = {
      recent: (a, b) => b.created_at.localeCompare(a.created_at),
      volume: (a, b) => Number(b.volume_cad) - Number(a.volume_cad) || b.orders - a.orders,
      active: (a, b) => (b.last_sign_in_at ?? "").localeCompare(a.last_sign_in_at ?? ""),
      name: (a, b) => nameOf(a).localeCompare(nameOf(b), "fr"),
    };
    return out.sort(by[sort]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all, filter, region, q, sort]);

  const exportCsv = () => {
    const url = URL.createObjectURL(new Blob([toCsv(list)], { type: "text/csv;charset=utf-8" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: `ooble-clients-${new Date().toISOString().slice(0, 10)}.csv` });
    a.click();
    URL.revokeObjectURL(url);
  };

  const selectStyle: React.CSSProperties = { height: 36, padding: "0 10px", borderRadius: 9, border: `1px solid ${C.bds}`, background: "var(--a-inputBg)", color: C.t1, fontFamily: FONT, fontSize: 13.5, cursor: "pointer" };
  const verifPill = (c: Client) => { const v = VERIF[verifOf(c)] ?? VERIF.not_started; return <Pill tone={v[1]} dot>{v[0]}</Pill>; };
  const tags = (c: Client) => (
    <>
      {c.is_staff && <Pill>Équipe</Pill>}
      {c.account_type === "business" && <Pill>Entreprise</Pill>}
      {c.closed_at && <Pill tone="danger">Fermé</Pill>}
    </>
  );

  const columns: Column<Client>[] = [
    { key: "name", header: "Client", sort: (c) => nameOf(c),
      render: (c) => <TwoLine lead={<Avatar name={nameOf(c)} />} primary={<span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>{nameOf(c)} {tags(c)}</span>} secondary={c.email} /> },
    { key: "place", header: "Lieu", hideBelow: 1100, sort: (c) => placeOf(c) ?? "",
      render: (c) => <TwoLine primary={<span style={{ color: placeOf(c) ? C.t2 : C.t3 }}>{placeOf(c) ?? "Inconnu"}{c.origin_late && placeOf(c) ? " *" : ""}</span>} secondary={sourceOf(c) ?? undefined} /> },
    { key: "verif", header: "Vérification", sort: (c) => verifOf(c), render: verifPill },
    { key: "orders", header: "Commandes", align: "right", sort: (c) => Number(c.volume_cad),
      render: (c) => c.orders ? <TwoLine primary={`${nfCad.format(Number(c.volume_cad))} $`} secondary={`${c.orders} commande${c.orders > 1 ? "s" : ""}`} /> : <span style={{ color: C.t3 }}>Aucune</span> },
    { key: "created", header: "Inscription", align: "right", hideBelow: 900, sort: (c) => c.created_at, render: (c) => <span style={{ color: C.t2, whiteSpace: "nowrap" }}>{day.format(new Date(c.created_at))}</span> },
    { key: "seen", header: "Connexion", align: "right", hideBelow: 1000, sort: (c) => c.last_sign_in_at ?? "", render: (c) => <span style={{ color: C.t3, whiteSpace: "nowrap" }}>{ago(c.last_sign_in_at)}</span> },
  ];

  return (
    <div style={{ fontFamily: FONT }}>
      <ClientsPopulation clients={rows ? clients.map((c) => ({
        created_at: c.created_at, orders: c.orders, business: c.account_type === "business",
        status: verifOf(c) === "approved" ? "approved" : verifOf(c) === "pending" ? "pending" : "other",
      })) : null} />

      {err && <p style={{ margin: "16px 0 0", color: C.dangerText, fontSize: 13 }}>{err}</p>}

      <Tabs style={{ marginTop: 28 }} value={filter} onChange={setFilter}
        items={filters.map((f) => ({ id: f.id, label: f.label, count: rows ? all.filter(f.test).length : undefined }))} />

      <Toolbar right={<Button size="sm" variant="ghost" onClick={exportCsv} disabled={!rows} icon={<Download style={{ width: 14, height: 14 }} />}>Exporter</Button>}>
        <SearchField value={q} onChange={setQ} placeholder="Nom, courriel, téléphone, ville, source" width={320} />
        <select value={region} onChange={(e) => setRegion(e.target.value)} aria-label="Province ou pays" className="ui-input" style={selectStyle}>
          <option value="all">Toutes les provinces et pays</option>
          {regions.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Trier" className="ui-input" style={selectStyle}>
          <option value="recent">Inscrits récemment</option>
          <option value="active">Connectés récemment</option>
          <option value="volume">Plus gros volume</option>
          <option value="name">Nom (A à Z)</option>
        </select>
      </Toolbar>

      {!rows ? <p style={{ padding: "40px 0", textAlign: "center", fontSize: 13.5, color: C.t3 }}>Chargement…</p> : (
        <DataTable
          key={`${filter}:${sort}`}
          rows={list}
          columns={columns}
          rowKey={(c) => c.id}
          onRowIntent={(c) => prefetchClient(c.id)}
          onRowClick={(c) => onOpen(c.id, nameOf(c))}
          pageSize={60}
          empty={<EmptyState icon={Users} title="Aucun client" text="Aucun client ne correspond à cette recherche." />}
          mobile={(c) => (
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <Avatar name={nameOf(c)} size={36} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <TwoLine primary={nameOf(c)} secondary={[placeOf(c), sourceOf(c)].filter(Boolean).join(" · ") || c.email || ""} />
                <div style={{ marginTop: 6, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                  {verifPill(c)}
                  <span style={{ fontSize: 12, color: C.t3 }}>{c.orders ? `${c.orders} cmd · ${nfCad.format(Number(c.volume_cad))} $` : `inscrit le ${day.format(new Date(c.created_at))}`}</span>
                </div>
              </div>
            </div>
          )}
        />
      )}
      <p style={{ margin: "12px 0 0", fontSize: 12, color: C.t3 }}>
        {list.length} résultat{list.length > 1 ? "s" : ""}. * Lieu d'une connexion plus récente (inscription antérieure au suivi). Volume : commandes terminées.
      </p>
    </div>
  );
}
