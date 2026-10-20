/**
 * Rôles du back-office : la seule source de vérité.
 *
 * Un membre peut cumuler plusieurs rôles (ex. Marketing + Support). Chaque rôle est un poste de
 * travail : une page d'accueil, les pages utiles à ce poste, et les actions qu'il peut faire.
 * La base applique les mêmes règles (RLS, fonctions) : cacher un bouton ici n'est jamais la seule
 * protection.
 */
import { useAuth } from "@/lib/auth";

export type Role = "admin" | "operator" | "kyc_reviewer" | "support" | "marketing" | "compliance" | "accounting";

export type TabId = "me" | "dashboard" | "control" | "notes" | "tasks" | "queue" | "orders" | "clients" | "kyc" | "accounting" | "treasury" | "compliance" | "settlement" | "mailbox" | "campaigns" | "announcements" | "team" | "platform" | "kb" | "manual" | "techdocs";

export const ALL_TABS: TabId[] = ["me", "dashboard", "notes", "tasks", "control", "queue", "orders", "settlement", "clients", "kyc", "accounting", "treasury", "compliance", "mailbox", "campaigns", "announcements", "team", "platform", "kb", "manual", "techdocs"];
const HELP: TabId[] = ["kb", "manual"];
/** Espace de l'équipe : ouvert à tous les membres. */
const TEAM: TabId[] = ["me", "notes", "tasks"];

/** Nom des pages, pour dire à un membre ce qu'il verra. */
export const TAB_LABEL: Record<TabId, string> = {
  me: "Mon espace", dashboard: "Tableau de bord", control: "Salle de contrôle", notes: "Notes à l'équipe", tasks: "Tâches", queue: "File d'attente", orders: "Commandes", settlement: "Règlement auto", clients: "Clients", kyc: "Vérifications",
  accounting: "Comptabilité", treasury: "Trésorerie", compliance: "Conformité", mailbox: "Messagerie", campaigns: "Marketing", announcements: "Bannière et maintenance",
  team: "Équipe", platform: "Réglages", kb: "Base de connaissances", manual: "Manuel", techdocs: "Documentation technique",
};

export interface RoleDef {
  id: Role;
  label: string;
  /** Ce que fait la personne, en une phrase. */
  mission: string;
  /** Page ouverte à l'arrivée. */
  home: TabId;
  tabs: TabId[];
}

/** Dans l'ordre d'affichage (du plus large au plus ciblé). */
export const ROLES: RoleDef[] = [
  { id: "admin", label: "Administrateur", mission: "Dirige tout : opérations, finances, équipe et plateforme.", home: "dashboard", tabs: ALL_TABS },
  { id: "operator", label: "Opérateur", mission: "Traite les commandes : prend les paiements reçus, envoie la cryptomonnaie, verse les CAD.", home: "queue",
    tabs: ["control", "queue", "orders", "settlement", "treasury", "clients", "mailbox", ...TEAM, ...HELP] },
  { id: "compliance", label: "Conformité", mission: "Fait respecter les règles du CANAFE : alertes, déclarations, registres, vérifications d'identité.", home: "compliance",
    tabs: ["compliance", "kyc", "clients", "orders", "accounting", "mailbox", ...TEAM, ...HELP] },
  { id: "accounting", label: "Comptabilité", mission: "Tient les comptes : marges, volumes, rapprochements et exports pour le comptable.", home: "accounting",
    tabs: ["accounting", "treasury", "orders", "settlement", ...TEAM, ...HELP] },
  { id: "kyc_reviewer", label: "Vérification", mission: "Vérifie l'identité des particuliers et des entreprises.", home: "kyc",
    tabs: ["kyc", "clients", "mailbox", ...TEAM, ...HELP] },
  { id: "support", label: "Support", mission: "Répond aux clients et suit leurs demandes.", home: "mailbox",
    tabs: ["mailbox", "clients", "orders", ...TEAM, ...HELP] },
  { id: "marketing", label: "Marketing", mission: "Fait connaître Ooble : campagnes de courriels aux clients.", home: "campaigns",
    tabs: ["campaigns", "mailbox", ...TEAM, ...HELP] },
];

export const ROLE_BY_ID = new Map(ROLES.map((r) => [r.id, r] as const));
export const roleLabel = (r: string) => ROLE_BY_ID.get(r as Role)?.label ?? r;

/** Rôles triés comme ROLES (le plus large d'abord). */
export const sortRoles = (roles: readonly string[]) => ROLES.map((r) => r.id).filter((id) => roles.includes(id));

/** Pages accessibles avec ces rôles (union). */
export function tabsFor(roles: readonly string[]): Set<TabId> {
  const set = new Set<TabId>();
  for (const r of roles) for (const t of ROLE_BY_ID.get(r as Role)?.tabs ?? []) set.add(t);
  return set;
}

/** Page d'accueil : « Mon espace » pour tout membre de l'équipe. */
export const homeFor = (roles: readonly string[]): TabId => (sortRoles(roles).length ? "me" : "kb");

/** Actions sensibles et qui peut les faire (même règle que la base). */
const CAPS = {
  "orders.act": ["admin", "operator"],
  "orders.delete": ["admin"],
  "settlement.act": ["admin", "operator"],
  "settlement.configure": ["admin"],
  "kyc.decide": ["admin", "kyc_reviewer", "compliance"],
  "register.export": ["admin", "compliance"],
  "docs.edit": ["admin"],
  "accounting.close": ["admin", "accounting"],
  "accounting.reopen": ["admin"],
  "accounting.entries": ["admin", "accounting"],
  "treasury.configure": ["admin", "accounting"],
  "accounts.unlock": ["admin", "support"],
  "accounts.suspend": ["admin", "compliance"],
  "clients.limit": ["admin", "compliance"],
  "marketing.control": ["admin"],
} as const satisfies Record<string, readonly Role[]>;
export type Capability = keyof typeof CAPS;

export const can = (roles: readonly string[], cap: Capability) => (CAPS[cap] as readonly string[]).some((r) => roles.includes(r));

/** Dans un composant : const can = useCan(); can("orders.act"). */
export function useCan() {
  const { roles } = useAuth();
  return (cap: Capability) => can(roles, cap);
}
