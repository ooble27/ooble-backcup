import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Check, Loader2, MailX } from "lucide-react";
import Logo from "@/components/Logo";
import { useLang } from "@/lib/i18n";
import { supabase } from "@/integrations/supabase/client";
import { supportEmail } from "@/lib/config";

const COPY = {
  fr: {
    loading: "Un instant…",
    doneTitle: "Vous êtes désabonné",
    doneSub: (e: string) => `${e} ne recevra plus nos courriels d'information et de promotion. Les courriels liés à vos ordres et à votre compte continueront d'arriver.`,
    resub: "Je me suis trompé, me réabonner",
    resubTitle: "Vous êtes réabonné",
    resubSub: (e: string) => `${e} recevra de nouveau nos nouvelles.`,
    badTitle: "Lien invalide",
    badSub: "Ce lien de désabonnement n'est pas reconnu. Écrivez-nous à {support} et nous vous retirerons de la liste.",
    home: "Retour à l'accueil",
  },
  en: {
    loading: "One moment…",
    doneTitle: "You're unsubscribed",
    doneSub: (e: string) => `${e} will no longer receive our news and promotional emails. Emails about your orders and your account will still arrive.`,
    resub: "That was a mistake, subscribe me again",
    resubTitle: "You're subscribed again",
    resubSub: (e: string) => `${e} will receive our news again.`,
    badTitle: "Invalid link",
    badSub: "This unsubscribe link isn't recognized. Write to {support} and we'll remove you from the list.",
    home: "Back to home",
  },
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type State = "loading" | "done" | "resub" | "bad";

/** Lien « Se désabonner » des courriels de campagne : /desabonnement?t=<jeton>. */
const Desabonnement = () => {
  const [lang] = useLang();
  const c = COPY[lang];
  const [params] = useSearchParams();
  const token = params.get("t") ?? "";
  const [state, setState] = useState<State>("loading");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);

  const call = async (subscribe: boolean): Promise<string | null> => {
    if (!UUID.test(token)) return null;
    const { data, error } = await supabase.rpc("marketing_unsubscribe" as never, { p_token: token, p_subscribe: subscribe } as never);
    if (error) return null;
    return (data as unknown as string | null) ?? null;
  };

  useEffect(() => {
    let alive = true;
    call(false).then((masked) => {
      if (!alive) return;
      if (masked) { setEmail(masked); setState("done"); } else setState("bad");
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const resubscribe = async () => {
    setBusy(true);
    const masked = await call(true);
    setBusy(false);
    if (masked) setState("resub");
  };

  const title = state === "done" ? c.doneTitle : state === "resub" ? c.resubTitle : state === "bad" ? c.badTitle : c.loading;
  const sub = state === "done" ? c.doneSub(email) : state === "resub" ? c.resubSub(email) : state === "bad" ? c.badSub.replace("{support}", supportEmail()) : "";

  return (
    <div className="app-surface app-type flex min-h-screen flex-col bg-background px-6">
      <header className="pt-[max(1.5rem,env(safe-area-inset-top))]">
        <Logo />
      </header>
      <main className="flex flex-1 items-center justify-center">
        <div className="animate-up w-full max-w-[440px] text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-foreground text-background">
            {state === "loading"
              ? <Loader2 className="h-6 w-6 animate-spin" strokeWidth={2.2} />
              : state === "bad"
                ? <MailX className="h-6 w-6" strokeWidth={2} />
                : <Check className="h-6 w-6" strokeWidth={2.4} />}
          </span>
          <h1 className="mt-6 font-display text-[26px] font-semibold tracking-tight">{title}</h1>
          {sub && <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">{sub}</p>}
          {state !== "loading" && (
            <div className="mt-8 flex flex-col items-center gap-3">
              <Link to="/" className="inline-flex h-10 items-center rounded-xl border border-border px-5 text-[14px] font-medium transition-colors hover:bg-secondary">
                {c.home}
              </Link>
              {state === "done" && (
                <button
                  type="button"
                  onClick={resubscribe}
                  disabled={busy}
                  className="text-[13.5px] text-muted-foreground underline underline-offset-4 transition-colors hover:text-foreground disabled:opacity-50"
                >
                  {c.resub}
                </button>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default Desabonnement;
