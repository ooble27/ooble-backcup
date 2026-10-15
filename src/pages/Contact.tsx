import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import HelpShape from "@/components/help/HelpShape";
import { HELP_COLORS, type HelpShape as Shape } from "@/lib/faq";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { TKey } from "@/lib/translations";
import { supportEmail } from "@/lib/config";

/* Contact — même langage que la page Entreprises et le centre d'aide : le sujet
   se choisit parmi de grands mots (chacun avec sa forme), le formulaire est
   fait de champs soulignés. Le message part dans support@ooble.ca
   (Admin → Messagerie). */

const Wrap = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
  <div className={`mx-auto max-w-[1200px] px-6 sm:px-10 ${className}`}>{children}</div>
);

const linkCls = "inline-flex items-center gap-1.5 text-[15px] font-medium underline-offset-[6px] transition-colors hover:underline";
const fieldCls =
  "w-full border-b-2 border-foreground/15 bg-transparent py-3 text-[17px] outline-none transition-colors placeholder:text-foreground/30 focus:border-foreground";

const SUBJECTS: { key: TKey; hint: TKey; shape: Shape; color: string }[] = [
  { key: "cont.subj1", hint: "cont.hint1", shape: "square", color: HELP_COLORS.peach },
  { key: "cont.subj2", hint: "cont.hint2", shape: "half", color: HELP_COLORS.coral },
  { key: "cont.subj3", hint: "cont.hint3", shape: "arch", color: HELP_COLORS.sage },
  { key: "cont.subj4", hint: "cont.hint4", shape: "triangle", color: HELP_COLORS.sun },
  { key: "cont.subj5", hint: "cont.hint5", shape: "circle", color: HELP_COLORS.mint },
];

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <label className="block">
    <span className="block text-[12px] uppercase tracking-[0.14em] text-muted-foreground">{label}</span>
    {children}
  </label>
);

const Contact = () => {
  const t = useT();
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pick, setPick] = useState(0);
  const [form, setForm] = useState({ name: "", email: "", message: "", website: "" });
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));
  const S = SUBJECTS[pick];

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (sending) return;
    setSending(true);
    setError(null);
    const { error: err } = await supabase.functions.invoke("send-email", { body: { contact: { ...form, subject: t(S.key) } } });
    setSending(false);
    if (err) {
      const status = (err as { context?: Response }).context?.status;
      setError(t(status === 429 ? "cont.tooMany" : "cont.error"));
      return;
    }
    setSent(true);
    setForm({ name: "", email: "", message: "", website: "" });
  };

  const facts: { k: TKey; v: React.ReactNode }[] = [
    { k: "cont.email", v: <a href={`mailto:${supportEmail()}`} className="underline-offset-4 hover:underline">{supportEmail()}</a> },
    { k: "cont.delay", v: t("cont.delayV") },
    { k: "cont.langs", v: t("cont.langsV") },
    { k: "cont.volumes", v: <Link to="/otc" className="underline-offset-4 hover:underline">{t("cont.volumesV")}</Link> },
  ];

  return (
    <div className="ink-neutral app-type min-h-screen bg-background tracking-[-0.015em]">
      <Header />

      <main>
        {/* ===================== EN-TÊTE ===================== */}
        <section className="relative overflow-hidden">
          <span aria-hidden className="ooble-float absolute hidden sm:block left-[8%] top-[22%] h-9 w-9 rounded-full" style={{ background: HELP_COLORS.mint }} />
          <span aria-hidden className="ooble-float absolute hidden sm:block right-[9%] top-[16%] h-10 w-10 rotate-12 rounded-md [animation-delay:-3s]" style={{ background: HELP_COLORS.coral }} />
          <span aria-hidden className="ooble-float absolute hidden sm:block right-[18%] top-[62%] h-0 w-0 border-x-[18px] border-b-[30px] border-x-transparent [animation-delay:-1.5s]" style={{ borderBottomColor: HELP_COLORS.sun }} />
          <Wrap className="relative pb-6 pt-20 text-center lg:pt-24">
            <p className="animate-up text-[12px] uppercase tracking-[0.16em] text-muted-foreground">{t("cont.kicker")}</p>
            <h1 className="animate-up mx-auto mt-6 max-w-[900px] font-display text-[2.8rem] font-semibold leading-[0.98] tracking-[-0.055em] [animation-delay:80ms] sm:text-[4.2rem] lg:text-[5.6rem]">
              {t("cont.title1")} <span style={{ color: HELP_COLORS.coral }}>{t("cont.title2")}</span>
            </h1>
          </Wrap>
        </section>

        {/* ===================== FAITS ===================== */}
        <Wrap className="pt-12">
          <dl className="grid border-y sm:grid-cols-2 lg:grid-cols-4">
            {facts.map((f, i) => (
              <div key={f.k} className={cn("py-6 sm:px-6", i > 0 && "border-t sm:border-t-0", i % 2 === 1 && "sm:border-l", i >= 2 && "sm:border-t lg:border-t-0", i > 0 && "lg:border-l")}>
                <dt className="text-[12px] uppercase tracking-[0.14em] text-muted-foreground">{t(f.k)}</dt>
                <dd className="mt-2 font-display text-[1.15rem] tracking-[-0.03em]">{f.v}</dd>
              </div>
            ))}
          </dl>
        </Wrap>

        {/* ===================== FORMULAIRE ===================== */}
        <section>
          <Wrap className="pt-24 lg:pt-32">
            {sent ? (
              <div className="animate-up mx-auto max-w-[640px] py-10 text-center">
                <HelpShape shape={S.shape} color={S.color} className="mx-auto h-12 w-12" />
                <h2 className="mt-8 font-display text-[2.6rem] font-semibold leading-[1] tracking-[-0.055em] sm:text-[3.4rem]">
                  {t("cont.sent")}<span style={{ color: HELP_COLORS.coral }}>.</span>
                </h2>
                <p className="mx-auto mt-5 max-w-[380px] text-[15px] leading-[1.7] text-muted-foreground">{t("cont.sentSub")}</p>
                <button type="button" onClick={() => setSent(false)} className={cn(linkCls, "mt-8")}>
                  {t("cont.sendAnother")} <ArrowRight className="h-4 w-4" strokeWidth={1.8} />
                </button>
              </div>
            ) : (
              <form onSubmit={submit} className="grid gap-14 lg:grid-cols-[1fr_1fr] lg:gap-16">
                {/* Champ piège invisible : seuls les robots le remplissent. */}
                <input
                  type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden
                  className="absolute -left-[9999px] h-0 w-0 opacity-0"
                  value={form.website} onChange={set("website")}
                />

                <div>
                  <p className="text-[13px] font-semibold uppercase tracking-[0.18em]" style={{ color: HELP_COLORS.coral }}>
                    {t("cont.aboutKicker")}
                  </p>
                  <div className="mt-6 flex flex-col items-start" role="radiogroup" aria-label={t("cont.subject")}>
                    {SUBJECTS.map((s, i) => (
                      <button
                        key={s.key}
                        type="button"
                        role="radio"
                        aria-checked={pick === i}
                        onClick={() => setPick(i)}
                        className={cn(
                          "flex items-center gap-4 py-1 text-left font-display text-[2.1rem] font-semibold leading-[1.1] tracking-[-0.05em] transition-colors sm:text-[2.7rem]",
                          pick === i ? "text-foreground" : "text-foreground/15 hover:text-foreground/40",
                        )}
                      >
                        <HelpShape shape={s.shape} color={s.color} className={cn("h-6 w-6 shrink-0 transition-all duration-300", pick === i ? "scale-100" : "scale-75 opacity-40")} />
                        {t(s.key)}
                      </button>
                    ))}
                  </div>
                  <p key={pick} className="animate-up mt-8 max-w-[420px] text-[15px] leading-[1.7] text-muted-foreground">
                    {t(S.hint)}{" "}
                    {pick === 2 ? (
                      <Link to="/otc" className="font-medium text-foreground underline underline-offset-4">{t("cont.volumesV")}</Link>
                    ) : (
                      <Link to="/faq" className="font-medium text-foreground underline underline-offset-4">FAQ</Link>
                    )}
                    .
                  </p>
                </div>

                <div className="space-y-8 lg:pt-12">
                  <div className="grid gap-8 sm:grid-cols-2">
                    <Field label={t("cont.name")}>
                      <input required maxLength={100} className={fieldCls} placeholder={t("cont.namePh")} value={form.name} onChange={set("name")} />
                    </Field>
                    <Field label={t("cont.emailLabel")}>
                      <input required type="email" maxLength={254} className={fieldCls} placeholder="vous@exemple.ca" value={form.email} onChange={set("email")} />
                    </Field>
                  </div>
                  <Field label={t("cont.message")}>
                    <textarea
                      required rows={6} maxLength={5000}
                      className={cn(fieldCls, "resize-none leading-[1.6]")}
                      value={form.message} onChange={set("message")}
                      placeholder={t(pick === 1 ? "cont.messagePhOrder" : "cont.messagePh")}
                    />
                  </Field>
                  {error && <p role="alert" className="text-[14px] text-destructive">{error}</p>}
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <p className="text-[13px] text-muted-foreground">{t("cont.noDocs")}</p>
                    <button
                      type="submit"
                      disabled={sending}
                      className="inline-flex items-center gap-2 rounded-md bg-foreground px-6 py-3.5 text-[15px] font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50"
                    >
                      {sending ? t("cont.sending") : t("cont.send")} <ArrowRight className="h-4 w-4" strokeWidth={1.8} />
                    </button>
                  </div>
                </div>
              </form>
            )}
          </Wrap>
        </section>

        <div className="pt-24 lg:pt-32" />
      </main>

      <Footer />
    </div>
  );
};

export default Contact;
