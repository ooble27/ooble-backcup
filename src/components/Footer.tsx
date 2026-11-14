import { Link } from "react-router-dom";
import { useT } from "@/lib/i18n";
import { FINTRAC_MSB_NUMBER } from "@/lib/legal";
import Logo from "./Logo";
import { CanadaFlag, InteracLogo } from "./marks";

const Footer = () => {
  const t = useT();

  // Trois colonnes côte à côte, aussi sur téléphone : des listes courtes plutôt qu'une longue colonne.
  const columns = [
    {
      title: t("footer.product"),
      links: [
        { label: t("nav.home"), to: "/" },
        { label: t("nav.signup"), to: "/inscription" },
        { label: t("nav.login"), to: "/connexion" },
      ],
    },
    {
      title: t("footer.company"),
      links: [
        { label: t("footer.businessAccounts"), to: "/entreprises" },
        { label: t("nav.otc"), to: "/otc" },
        { label: t("footer.privacy"), to: "/politique-confidentialite" },
      ],
    },
    {
      title: t("footer.support"),
      links: [
        { label: t("guide.title"), to: "/guide" },
        { label: t("nav.faq"), to: "/faq" },
        { label: t("nav.contact"), to: "/contact" },
      ],
    },
  ];

  return (
    <footer className="bg-background">
      <div className="mx-auto max-w-[1200px] px-6 pt-24 sm:px-10">
        <div className="grid gap-10 border-b pb-12 lg:grid-cols-[1.4fr_2fr]">
          <div>
            <Logo />
            <p className="mt-5 max-w-xs text-[14px] leading-[1.6] text-muted-foreground">
              {t("footer.desc")}
            </p>
            <div className="mt-6">
              <p className="text-[12px] text-muted-foreground">{t("footer.paymentAccepted")}</p>
              <InteracLogo className="mt-2 h-7" />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4 sm:gap-8">
          {columns.map((col) => (
            <div key={col.title} className="min-w-0">
              <h4 className="font-display text-[11.5px] uppercase tracking-[0.12em] text-muted-foreground sm:text-[13px] sm:tracking-[0.14em]">
                {col.title}
              </h4>
              <ul className="mt-4 space-y-3">
                {col.links.map((link) => (
                  <li key={link.to}>
                    <Link
                      to={link.to}
                      className="text-[14px] text-foreground/80 transition-colors hover:text-foreground sm:text-[15px]"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          </div>
        </div>

        <div className="flex items-center gap-2.5 border-b py-5 text-xs text-muted-foreground">
          <CanadaFlag className="h-3.5 w-7 shrink-0 rounded-[2px] shadow-[0_0_0_1px_rgba(0,0,0,0.08)]" />
          <span>
            FINTRAC <span className="font-medium tabular-nums text-foreground/80">{FINTRAC_MSB_NUMBER}</span>
          </span>
        </div>

        <div className="flex flex-col gap-4 py-8 sm:flex-row sm:items-start sm:justify-between">
          <p className="shrink-0 text-xs text-muted-foreground">
            © {new Date().getFullYear()} Ooble · Canada ·{" "}
            <Link to="/conditions-utilisation" className="underline-offset-4 hover:text-foreground hover:underline">{t("footer.terms")}</Link>
          </p>
          <p className="max-w-xl text-xs leading-relaxed text-muted-foreground">
            {t("footer.risk")}
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-[1200px] overflow-hidden px-6 sm:px-10" aria-hidden>
        <p className="-mb-[2.6vw] select-none text-center font-display text-[26vw] leading-[0.8] tracking-[-0.06em] text-foreground">
          Ooble
        </p>
      </div>
    </footer>
  );
};

export default Footer;
