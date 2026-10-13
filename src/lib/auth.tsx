import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { clearAdminCache } from "@/lib/adminCache";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { clearCache } from "@/lib/cache";
import { forgetPushDevice } from "@/lib/pushNotifications";

export type AppRole = Database["public"]["Enums"]["app_role"];

export interface AuthUser {
  id: string;
  name: string;
  email: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  /** Rôles d'équipe de l'utilisateur (vide pour un client). */
  roles: AppRole[];
  /** A un rôle admin. */
  isAdmin: boolean;
  /** Fait partie de l'équipe (au moins un rôle) → accès back-office. */
  isStaff: boolean;
  /** Les rôles sont encore en cours de chargement. */
  rolesLoading: boolean;
  signIn: (email: string, password: string, captchaToken?: string | null) => Promise<{ error?: string }>;
  signUp: (email: string, password: string, name: string, extra?: {
    accountType?: "individual" | "business";
    businessName?: string;
    businessNumber?: string;
    businessAddress?: string;
    businessPhone?: string;
    captchaToken?: string | null;
  }) => Promise<{ error?: string; needsConfirmation?: boolean }>;
  /** Envoie le courriel de réinitialisation de mot de passe. */
  sendPasswordReset: (email: string, captchaToken?: string | null) => Promise<{ error?: string }>;
  /** Définit un nouveau mot de passe (après clic sur le lien de réinitialisation). */
  updatePassword: (password: string) => Promise<{ error?: string }>;
  /** Change l'adresse e-mail (envoie un lien de confirmation au nouvel e-mail). */
  updateEmail: (email: string) => Promise<{ error?: string }>;
  /** Connexion via Google OAuth. */
  signInWithGoogle: () => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** Nom d'affichage depuis l'e-mail, si aucun nom n'a été fourni. */
function nameFromEmail(email: string): string {
  const local = email.split("@")[0] || "Ami";
  const clean = local.replace(/[._-]+/g, " ").trim();
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

function toUser(session: Session | null): AuthUser | null {
  const u = session?.user;
  if (!u) return null;
  const email = u.email ?? "";
  const name = (u.user_metadata?.full_name as string | undefined)?.trim() || nameFromEmail(email);
  return { id: u.id, name, email };
}

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [roles, setRoles] = useState<AppRole[]>([]);
  // Rôles chargés pour quel utilisateur : tant que ce n'est pas l'utilisateur
  // courant, les rôles sont « en chargement » (évite de renvoyer le staff
  // vers /app quand il ouvre directement /admin).
  const [rolesFor, setRolesFor] = useState<string | null>(null);
  const lastUid = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    // Session initiale + abonnement aux changements (connexion, déconnexion,
    // rafraîchissement de jeton, confirmation d'e-mail…).
    // Filet de sécurité : si Supabase se bloque (session corrompue, réseau
    // instable), on force `loading` à false après 4 s pour ne jamais laisser
    // l'utilisateur sur un écran de chargement infini.
    const safety = setTimeout(() => setLoading(false), 4000);
    supabase.auth.getSession().then(({ data }) => {
      clearTimeout(safety);
      if (lastUid.current === undefined) lastUid.current = data.session?.user?.id ?? null;
      setUser(toUser(data.session));
      setLoading(false);
    }).catch(() => {
      clearTimeout(safety);
      setUser(null);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      clearTimeout(safety);
      // Autre compte (ou déconnexion) sur cet appareil : rien de l'ancien compte ne reste en mémoire.
      const next = session?.user?.id ?? null;
      if (lastUid.current !== undefined && lastUid.current !== next) clearAdminCache();
      lastUid.current = next;
      setUser(toUser(session));
      setLoading(false);
    });
    return () => {
      clearTimeout(safety);
      sub.subscription.unsubscribe();
    };
  }, []);

  // Charge les rôles d'équipe de l'utilisateur connecté (RLS : chacun voit les
  // siens). Un client sans rôle obtient un tableau vide → pas de back-office.
  useEffect(() => {
    const uid = user?.id;
    if (!uid) {
      setRoles([]);
      setRolesFor(null);
      return;
    }
    let active = true;
    supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", uid)
      .then(({ data }) => {
        if (!active) return;
        setRoles((data ?? []).map((r) => r.role));
        setRolesFor(uid);
      });
    return () => { active = false; };
  }, [user?.id]);

  const rolesLoading = !!user && rolesFor !== user.id;

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      roles,
      isAdmin: roles.includes("admin"),
      isStaff: roles.length > 0,
      rolesLoading,
      signIn: async (email, password, captchaToken) => {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
          options: captchaToken ? { captchaToken } : undefined,
        });
        return error ? { error: error.message } : {};
      },
      signUp: async (email, password, name, extra) => {
        // 8 caractères minimum (même règle à poser dans Supabase → Auth).
        if (password.length < 8) return { error: "Password should be at least 8 characters." };
        // Adresses jetables refusées (la base les refuse aussi, mais avec une
        // erreur générique : on prévient ici avec un message clair).
        const { data: allowed } = await supabase.rpc("email_domain_allowed" as never, { _email: email.trim() } as never);
        if (allowed === false) return { error: "disposable_email" };

        const meta: Record<string, string> = {
          full_name: name.trim() || nameFromEmail(email),
        };
        if (extra?.accountType) meta.account_type = extra.accountType;
        if (extra?.businessName) meta.business_name = extra.businessName;
        if (extra?.businessNumber) meta.business_number = extra.businessNumber;
        if (extra?.businessAddress) meta.business_address = extra.businessAddress;
        if (extra?.businessPhone) meta.business_phone = extra.businessPhone;

        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: meta,
            emailRedirectTo: `${window.location.origin}/app`,
            ...(extra?.captchaToken ? { captchaToken: extra.captchaToken } : {}),
          },
        });
        if (error) return { error: /saving new user/i.test(error.message) ? "disposable_email" : error.message };
        return { needsConfirmation: !data.session };
      },
      sendPasswordReset: async (email, captchaToken) => {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${window.location.origin}/reinitialiser`,
          ...(captchaToken ? { captchaToken } : {}),
        });
        return error ? { error: error.message } : {};
      },
      updatePassword: async (password) => {
        if (password.length < 8) return { error: "Password should be at least 8 characters." };
        const { error } = await supabase.auth.updateUser({ password });
        return error ? { error: error.message } : {};
      },
      updateEmail: async (email) => {
        const { error } = await supabase.auth.updateUser({
          email: email.trim(),
        });
        return error ? { error: error.message } : {};
      },
      signInWithGoogle: async () => {
        const { error } = await supabase.auth.signInWithOAuth({
          provider: "google",
          options: {
            redirectTo: `${window.location.origin}/connexion`,
            queryParams: { prompt: "select_account" },
          },
        });
        return error ? { error: error.message } : {};
      },
      signOut: async () => {
        // Cet appareil seulement : les autres appareils du compte restent
        // connectés. Et il ne reçoit plus les notifications du compte.
        await forgetPushDevice();
        await supabase.auth.signOut({ scope: "local" });
        clearCache();
        clearAdminCache();
      },
    }),
    [user, loading, roles, rolesLoading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth doit être utilisé dans <AuthProvider>");
  return ctx;
}
