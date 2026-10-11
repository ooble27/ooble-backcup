import { Link } from "react-router-dom";
import { useT } from "@/lib/i18n";
import { FINTRAC_MSB_NUMBER } from "@/lib/legal";
import Logo from "./Logo";
import { CanadaFlag, InteracLogo } from "./marks";

const Footer = () => {
  const t = useT();

  const columns = [
    {
      title: t("footer.product"),
      links: [
        { label: t("nav.home"), to: "/" },
        { label: t("nav.business"), to: "/entreprises" },
        { label: t("nav.otc"), to: "/otc" },
        { label: t("nav.signup"), to: "/inscription" },
      ],
    },
    {
      title: t("footer.resources"),
      links: [
        { label: t("guide.title"), to: "/guide" },
        { label: t("nav.faq"), to: "/faq" },
        { label: t("nav.contact"), to: "/contact" },
        { label: t("nav.login"), to: "/connexion" },
        { label: t("footer.terms"), to: "/conditions-utilisation" },
        { label: t("footer.privacy"), to: "/politique-confidentialite" },
      ],
    },
  ];

  return (
    <footer className="bg-background">
      <div className="mx-auto max-w-[1200px] px-6 pt-24 sm:px-10">
        <div className="grid gap-12 border-b pb-12 sm:grid-cols-[1.4fr_1fr_1fr]">
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

          {columns.map((col) => (
            <div key={col.title}>
              <h4 className="font-display text-[13px] uppercase tracking-[0.14em] text-muted-foreground">
                {col.title}
              </h4>
              <ul className="mt-4 space-y-3">
                {col.links.map((link) => (
                  <li key={link.to}>
                    <Link
                      to={link.to}
                      className="text-[15px] text-foreground/80 transition-colors hover:text-foreground"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2.5 border-b py-5 text-xs text-muted-foreground">
          <CanadaFlag className="h-3.5 w-7 shrink-0 rounded-[2px] shadow-[0_0_0_1px_rgba(0,0,0,0.08)]" />
          <span>
            FINTRAC <span className="font-medium tabular-nums text-foreground/80">{FINTRAC_MSB_NUMBER}</span>
          </span>
        </div>

        <div className="flex flex-col gap-4 py-8 sm:flex-row sm:items-start sm:justify-between">
          <p className="shrink-0 text-xs text-muted-foreground">
            © {new Date().getFullYear()} Ooble · Canada
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
