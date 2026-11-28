import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Building2, Check, ChevronRight, Eye, EyeOff, Loader2, Plus } from "lucide-react";
import AppShell from "@/components/app/AppShell";
import { StepHeader } from "@/components/app/Flat";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { getMyKyc, peekMyKyc, type KycDbStatus } from "@/lib/kyc";
import { getMyProfile, peekMyProfile, type MyProfile } from "@/lib/profile";
import { useLang, useT } from "@/lib/i18n";
import type { TKey } from "@/lib/translations";

/**
 * Mes entreprises (compte individuel) : les comptes entreprise dont la personne est responsable, et la création
 * d'un nouveau compte entreprise. Règle : la personne fait d'abord vérifier son identité ; ensuite seulement elle
 * peut créer un ou plusieurs comptes entreprise, chacun avec son propre courriel et son mot de passe. La création
 * passe par la fonction serveur business-account, qui relie le compte entreprise à la personne.
 */

interface Biz { id: string; business_name: string | null; email: string | null; business_status: KycDbStatus; created_at: string }

const STATUS: Record<KycDbStatus, TKey> = {
  not_started: "biz.stTodo", pending: "biz.stPending", approved: "biz.stApproved", rejected: "biz.stRejected",
};

const CSS = `
.mb-list { display: flex; flex-direction: column; gap: 10px; }
.mb-item { display: flex; align-items: center; gap: 12px; padding: 12px 14px; border: 2.5px solid #111; border-radius: 20px; background: #fff; }
.mb-ic { width: 40px; height: 40px; flex: none; border-radius: 99px; border: 2.5px solid #111; background: #dccaff; display: flex; align-items: center; justify-content: center; }
.mb-tag { flex: none; font-size: 11.5px; font-weight: 600; padding: 3px 10px; border-radius: 99px; border: 2px solid #111; white-space: nowrap; }
.mb-note { margin: 0; font-size: 13px; color: #555; line-height: 1.5; }
.mb-field { display: block; padding: 2px 0; }
.mb-pass { position: relative; display: block; }
.mb-pass .ac-in { padding-right: 50px; }
.mb-pass button { position: absolute; right: 8px; top: 50%; transform: translateY(-50%); background: none; border: 0; padding: 8px; color: #555; }
.mb-go { display: flex; flex-wrap: wrap; }
`;

const MesEntreprises = () => {
  const t = useT();
  const [lang] = useLang();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [profile, setProfile] = useState<MyProfile | null>(() => peekMyProfile(user?.id) ?? null);
  const [kyc, setKyc] = useState<KycDbStatus | null>(() => peekMyKyc(user?.id)?.status ?? null);
  const [list, setList] = useState<Biz[] | null>(null);
  const [view, setView] = useState<"list" | "new" | "done">("list");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ name: string; email: string } | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.rpc("my_businesses" as never);
    setList(((data as Biz[] | null) ?? []));
  }, []);

  useEffect(() => {
    getMyProfile().then(setProfile);
    getMyKyc().then((k) => setKyc(k?.status ?? "not_started"));
    load();
  }, [load]);

  // Un compte entreprise n'a pas de « Mes entreprises » : il a son dossier.
  useEffect(() => { if (profile?.accountType === "business") navigate("/app/entreprise", { replace: true }); }, [profile, navigate]);

  const verified = kyc === "approved";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setError(null);
    const { data, error: err } = await supabase.functions.invoke("business-account", {
      body: { businessName: name.trim(), email: email.trim(), password, lang },
    });
    setBusy(false);
    let msg = (data as { error?: string } | null)?.error ?? null;
    if (err && !msg) {
      const ctx = (err as { context?: Response }).context;
      try { msg = ctx ? ((await ctx.clone().json()) as { error?: string }).error ?? null : null; } catch { /* sans corps */ }
      msg = msg ?? t("biz.errGeneric");
    }
    if (msg) { setError(msg); return; }
    setCreated({ name: name.trim(), email: email.trim().toLowerCase() });
    setName(""); setEmail(""); setPassword("");
    setView("done");
    load();
  };

  const header = <StepHeader title={t("biz.title")} sub={t("biz.sub")} onBack={() => (view === "list" ? navigate("/app/compte") : setView("list"))} />;

  if (view === "done" && created) {
    return (
      <AppShell header={header}>
        <style>{CSS}</style>
        <div className="flex flex-col items-start gap-3">
          <span className="mb-ic" style={{ background: "#bfe8c8" }}><Check className="h-5 w-5" strokeWidth={2.6} /></span>
          <h2 className="ac-title" style={{ margin: 0 }}>{t("biz.doneTitle")}</h2>
          <p className="mb-note">{t("biz.doneSub").replace("{name}", created.name).replace("{email}", created.email)}</p>
          <div className="mb-go mt-3 w-full"><button type="button" className="ac-act" onClick={() => setView("list")}>{t("biz.backList")}</button></div>
        </div>
      </AppShell>
    );
  }

  if (view === "new") {
    return (
      <AppShell header={header}>
        <style>{CSS}</style>
        <form onSubmit={submit} className="flex flex-col gap-5">
          <div>
            <h2 className="ac-title" style={{ margin: 0 }}>{t("biz.newTitle")}</h2>
            <p className="mb-note mt-2">{t("biz.newSub")}</p>
          </div>
          <label className="mb-field">
            <span className="ac-k block">{t("biz.name")}</span>
            <input className="ac-in" value={name} onChange={(e) => setName(e.target.value)} maxLength={200} autoComplete="organization" required />
          </label>
          <label className="mb-field">
            <span className="ac-k block">{t("biz.email")}</span>
            <input className="ac-in" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" required />
            <span className="mb-note block mt-1" style={{ fontSize: 12 }}>{t("biz.emailHint")}</span>
          </label>
          <label className="mb-field">
            <span className="ac-k block">{t("biz.password")}</span>
            <span className="mb-pass">
              <input className="ac-in" type={show ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} maxLength={72} autoComplete="new-password" required />
              <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? t("biz.hide") : t("biz.show")}>{show ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}</button>
            </span>
            <span className="mb-note block mt-1" style={{ fontSize: 12 }}>{t("biz.passwordHint")}</span>
          </label>
          <p className="mb-note">{t("biz.after")}</p>
          {error && <p role="alert" className="ac-note">{error}</p>}
          <div className="mb-go">
            <button type="submit" className="ac-act" disabled={busy || name.trim().length < 2 || !email.trim() || password.length < 8}>
              {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : t("biz.create")}
            </button>
          </div>
        </form>
      </AppShell>
    );
  }

  return (
    <AppShell header={header}>
      <style>{CSS}</style>
      <div className="flex flex-col gap-5">
        {list === null ? (
          <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin" aria-label={t("support.loading")} /></div>
        ) : list.length === 0 ? (
          <p className="mb-note">{t("biz.none")}</p>
        ) : (
          <div className="mb-list">
            {list.map((b) => (
              <div key={b.id} className="mb-item">
                <span className="mb-ic"><Building2 className="h-5 w-5" strokeWidth={2} /></span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-medium text-[#111]">{b.business_name || t("biz.unnamed")}</span>
                  <span className="block break-all text-[12.5px] text-[#555]">{t("biz.loginWith")} {b.email}</span>
                  <span className="mb-tag mt-2 inline-block" style={{ background: b.business_status === "approved" ? "#bfe8c8" : b.business_status === "pending" ? "#bfe0ff" : "#fff" }}>{t(STATUS[b.business_status])}</span>
                </span>
              </div>
            ))}
          </div>
        )}

        {verified ? (
          <div className="mb-go">
            <button type="button" className="ac-act" onClick={() => { setError(null); setView("new"); }}>
              {t("biz.createCta")}<Plus className="h-5 w-5" strokeWidth={2.2} />
            </button>
          </div>
        ) : kyc !== null && (
          <div className="mb-item" style={{ alignItems: "flex-start", background: "#f3f3f0" }}>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-medium text-[#111]">{kyc === "pending" ? t("biz.kycPendingTitle") : t("biz.kycTitle")}</span>
              <span className="mb-note block mt-1">{kyc === "pending" ? t("biz.kycPendingSub") : t("biz.kycSub")}</span>
              {kyc !== "pending" && (
                <Link to="/app/verification" className="ac-link mt-3 inline-flex items-center gap-1">{t("biz.kycCta")} <ChevronRight className="h-4 w-4" /></Link>
              )}
            </span>
          </div>
        )}
        <p className="mb-note">{t("biz.how")}</p>
      </div>
    </AppShell>
  );
};

export default MesEntreprises;
