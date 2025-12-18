import Image from "next/image";

const NAV_ITEMS: Array<{ label: string; href: string }> = [
  { label: "General Information", href: "https://www.fairyplace.biz/" },
  {
    label: "Hospitality Industry",
    href: "https://www.fairyplace.biz/hospitality-industry",
  },
  { label: "Interior Design", href: "https://www.fairyplace.biz/interior-design" },
  {
    label: "Restaurant Business",
    href: "https://www.fairyplace.biz/restaurant-business",
  },
  { label: "Fashion Brands", href: "https://www.fairyplace.biz/fashion-brands" },
  {
    label: "Upholstery Experts",
    href: "https://www.fairyplace.biz/upholstery-experts",
  },
  { label: "Events Organizers", href: "https://www.fairyplace.biz/events-organizers" },
  { label: "Home Decor", href: "https://www.fairyplace.biz/home-decor" },
  {
    label: "Spas, Fitness, Beauty",
    href: "https://www.fairyplace.biz/spas-fitness-wellness",
  },
  { label: "Privacy Policy", href: "https://www.fairyplace.biz/privacy-policy" },
];

export default function HomePage() {
  const activeIndex = 0;

  return (
    <main>
      {/* HERO */}
      <section className="border-b border-[var(--border)] bg-[linear-gradient(180deg,var(--surface)_0%,var(--bg)_100%)] px-8 py-16 sm:px-12 sm:py-20 lg:px-16">
        <div className="mx-auto max-w-6xl">
          <div className="flex items-start justify-between gap-6">
            <div className="min-w-0">
              <h1 className="max-w-[720px] text-balance text-[40px] font-semibold leading-tight tracking-tight text-[var(--text)]">
                BotCat by FairyPlace helps you create bespoke surface designs for
                fabric, wallpaper, and leather
              </h1>
              <p className="mt-4 max-w-[640px] text-[18px] leading-relaxed text-[var(--text-muted)]">
                From concept to approved sketches, you receive private print-on-demand links
                with partners such as Spoonflower, Contrado, and others. The design is free;
                you pay only POD partners for production.
              </p>
            </div>

            <div className="shrink-0">
              <Image
                src="/FP_Logo.png"
                alt="FairyPlace"
                height={44}
                width={44}
                priority
                className="h-[44px] w-auto"
              />
            </div>
          </div>
        </div>
      </section>

      {/* DASHBOARD */}
      <section className="mx-auto grid min-h-[80vh] max-w-6xl grid-cols-1 lg:grid-cols-[240px_1fr]">
        {/* Sidebar */}
        <aside className="border-r border-[var(--border)] bg-[var(--surface)] p-6">
          <h3 className="mb-4 text-[14px] font-medium uppercase tracking-wide text-[var(--text-muted)]">
            Navigation
          </h3>
          <nav>
            {NAV_ITEMS.map((item, idx) => {
              const isActive = idx === activeIndex;
              return (
                <a
                  key={item.href}
                  href={item.href}
                  target="_blank"
                  rel="noreferrer"
                  className={`mb-2 block rounded-md px-3 py-2 text-[14px] transition ${
                    isActive
                      ? "bg-[rgba(37,99,235,0.08)] font-semibold text-[var(--action)]"
                      : "text-[var(--text)] hover:bg-[rgba(37,99,235,0.06)]"
                  }`}
                >
                  {item.label}
                </a>
              );
            })}
          </nav>
        </aside>

        {/* Content */}
        <main className="p-8 sm:p-10">
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Card v1 */}
            <a
              href="/chat"
              className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6 transition hover:shadow-sm"
            >
              <div className="flex flex-col gap-5">
                <div className="flex items-center justify-center">
                  <Image
                    src="/BotCat_Portrait_512.png"
                    alt="BotCat  Instant"
                    width={220}
                    height={220}
                    className="h-[220px] w-auto"
                  />
                </div>
                <div className="text-[14px] leading-relaxed text-[var(--text-muted)]">
                  <strong className="text-[var(--text)]">BotCat  Instant</strong> Free
                  bespoke surface design consultant using proven, cost-efficient AI models.
                  No signup required. Fast concepts and sketches, with POD links for
                  production.
                </div>
                <div className="inline-flex w-fit items-center justify-center rounded-lg bg-[var(--action)] px-4 py-2 text-[14px] font-semibold text-white">
                  Open v1.0
                </div>
              </div>
            </a>

            {/* Card v2 */}
            <a
              href="/chat_pro"
              className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6 transition hover:shadow-sm"
            >
              <div className="flex flex-col gap-5">
                <div className="flex items-center justify-center">
                  <Image
                    src="/BotCat_PRO_512.png"
                    alt="BotCat  Pro"
                    width={220}
                    height={220}
                    className="h-[220px] w-auto"
                  />
                </div>
                <div className="text-[14px] leading-relaxed text-[var(--text-muted)]">
                  <strong className="text-[var(--text)]">
                    BotCat  Pro (signup required)
                  </strong>{" "}
                  Free bespoke design consultant powered by the latest OpenAI models.
                  Registration required. Higher accuracy, deeper iterations, and downloadable
                  transcripts of past conversations.
                </div>
                <div className="inline-flex w-fit items-center justify-center rounded-lg border border-[var(--border)] bg-transparent px-4 py-2 text-[14px] font-semibold text-[var(--primary)]">
                  View v2.0
                </div>
              </div>
            </a>
          </div>
        </main>
      </section>
    </main>
  );
}
