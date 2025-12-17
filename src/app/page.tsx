import Image from "next/image";
import Link from "next/link";

const LINKS: Array<{ label: string; href: string }> = [
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

function ExternalLink({ href, children }: { href: string; children: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="text-[var(--action)] hover:underline"
    >
      {children}
    </a>
  );
}

export default function HomePage() {
  return (
    <main className="mx-auto max-w-6xl px-5 py-10">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Image
            src="/FP_Logo.png"
            alt="FairyPlace™"
            width={44}
            height={44}
            priority
            className="rounded-lg border border-[var(--border)] bg-[var(--surface)]"
          />
          <div className="leading-tight">
            <div className="text-sm font-semibold text-[var(--text)]">
              FairyPlace™
            </div>
            <div className="text-xs text-[var(--text-muted)]">
              BotCat™ Consultant
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 text-sm">
          <ExternalLink href="https://fairyplace.biz">Official website</ExternalLink>
          <span className="text-[var(--border)]">|</span>
          <a
            className="text-[var(--action)] hover:underline"
            href="mailto:order@fairyplace.net"
          >
            order@fairyplace.net
          </a>
          <a
            className="text-[var(--action)] hover:underline"
            href="mailto:support@fairyplace.net"
          >
            support@fairyplace.net
          </a>
        </div>
      </div>

      {/* Hero */}
      <section className="mt-10 grid gap-8 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <h1 className="text-balance text-3xl font-semibold tracking-tight text-[var(--text)] sm:text-4xl">
            BotCat™ by FairyPlace™ helps you create bespoke surface designs for fabric,
            wallpaper, and leather.
          </h1>
          <p className="mt-4 text-pretty text-base leading-relaxed text-[var(--text-muted)]">
            From concept to approved sketches, you receive private print-on-demand links
            with partners such as Spoonflower, Contrado, and others. The design is free;
            you pay only POD partners for production.
          </p>

          <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1 text-xs text-[var(--text-muted)]">
            <span className="inline-block h-2 w-2 rounded-full bg-[var(--brand)]" />
            Enterprise-grade UI • Auto light/dark theme • Private transcripts
          </div>
        </div>

        {/* Model cards */}
        <div className="lg:col-span-5">
          <div className="grid gap-4">
            <Link
              href="/chat"
              className="group rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
            >
              <div className="flex items-start gap-4">
                <Image
                  src="/BotCat_Portrait_512.png"
                  alt="BotCat — Instant"
                  width={64}
                  height={64}
                  className="rounded-xl border border-[var(--border)]"
                />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="text-base font-semibold text-[var(--text)]">
                      BotCat Your Bespoke Design Consultant
                    </div>
                    <span className="rounded-full bg-[color-mix(in_srgb,var(--action)_12%,transparent)] px-2 py-0.5 text-xs text-[var(--action)]">
                      v1.0
                    </span>
                  </div>
                  <div className="mt-1 text-sm text-[var(--text-muted)]">
                    <strong>BotCat — Instant</strong> Free bespoke surface design consultant
                    using proven, cost-efficient AI models. No signup required. Fast concepts
                    and sketches, with POD links for production.
                  </div>
                </div>
              </div>
              <div className="mt-4 flex items-center justify-between">
                <span className="text-sm text-[var(--action)] group-hover:underline">
                  Open chat
                </span>
                <span className="text-xs text-[var(--text-muted)]">
                  No signup
                </span>
              </div>
            </Link>

            <Link
              href="/chat_pro"
              className="group rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
            >
              <div className="flex items-start gap-4">
                <Image
                  src="/BotCat_PRO_512.png"
                  alt="BotCat — Pro"
                  width={64}
                  height={64}
                  className="rounded-xl border border-[var(--border)]"
                />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="text-base font-semibold text-[var(--text)]">
                      BotCat™ Your Bespoke Design Consultant Professional
                    </div>
                    <span className="rounded-full bg-[color-mix(in_srgb,var(--brand)_22%,transparent)] px-2 py-0.5 text-xs text-[var(--primary)]">
                      v2.0
                    </span>
                  </div>
                  <div className="mt-1 text-sm text-[var(--text-muted)]">
                    <strong>BotCat — Pro (signup required)</strong> Free bespoke design
                    consultant powered by the latest OpenAI models. Registration required.
                    Higher accuracy, deeper iterations, and downloadable transcripts of past
                    conversations.
                  </div>
                </div>
              </div>
              <div className="mt-4 flex items-center justify-between">
                <span className="text-sm text-[var(--action)] group-hover:underline">
                  Learn more
                </span>
                <span className="text-xs text-[var(--text-muted)]">
                  Signup required
                </span>
              </div>
            </Link>
          </div>
        </div>
      </section>

      {/* Dashboard section */}
      <section className="mt-12 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm sm:p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-[var(--text)]">
              Dashboard
            </h2>
            <p className="text-sm text-[var(--text-muted)]">
              Quick navigation for business use-cases.
            </p>
          </div>
          <span className="rounded-full border border-[var(--border)] bg-[color-mix(in_srgb,var(--brand)_18%,transparent)] px-3 py-1 text-xs text-[var(--primary)]">
            Enterprise SaaS
          </span>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <div className="rounded-xl border border-[var(--border)]">
              <div className="border-b border-[var(--border)] px-4 py-3 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                Sections
              </div>
              <ul className="divide-y divide-[var(--border)]">
                {LINKS.map((l, idx) => (
                  <li key={l.href}>
                    <a
                      href={l.href}
                      target="_blank"
                      rel="noreferrer"
                      className={`flex items-center justify-between px-4 py-3 text-sm transition hover:bg-[color-mix(in_srgb,var(--action)_6%,transparent)]`}
                    >
                      <span className="text-[var(--text)]">{l.label}</span>
                      {idx === 0 ? (
                        <span className="rounded-full bg-[color-mix(in_srgb,var(--action)_12%,transparent)] px-2 py-0.5 text-xs text-[var(--action)]">
                          Active
                        </span>
                      ) : (
                        <span className="text-xs text-[var(--text-muted)]">Open</span>
                      )}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="lg:col-span-7">
            <div className="h-full rounded-xl border border-[var(--border)] p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-sm font-semibold text-[var(--text)]">
                    General Information
                  </div>
                  <p className="mt-1 text-sm text-[var(--text-muted)]">
                    Explore FairyPlace™ business solutions and discover industry-focused
                    use cases.
                  </p>
                </div>
                <a
                  href="https://www.fairyplace.biz/"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center rounded-lg bg-[var(--action)] px-3 py-2 text-sm font-medium text-white transition hover:opacity-90"
                >
                  Open
                </a>
              </div>

              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <div className="rounded-xl border border-[var(--border)] bg-[color-mix(in_srgb,var(--action)_4%,transparent)] p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                    Status
                  </div>
                  <div className="mt-2 text-sm text-[var(--text)]">
                    BotCat™ v1.0 is live. v2.0 is in preparation.
                  </div>
                </div>
                <div className="rounded-xl border border-[var(--border)] bg-[color-mix(in_srgb,var(--brand)_10%,transparent)] p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                    Brand
                  </div>
                  <div className="mt-2 text-sm text-[var(--text)]">
                    Yellow accents are used sparingly for premium brand emphasis.
                  </div>
                </div>
              </div>

              <div className="mt-6 text-xs text-[var(--text-muted)]">
                Tip: your browser controls light/dark theme automatically.
              </div>
            </div>
          </div>
        </div>
      </section>

      <footer className="mt-10 border-t border-[var(--border)] pt-6 text-xs text-[var(--text-muted)]">
        © {new Date().getFullYear()} FairyPlace™. BotCat™ Consultant.
      </footer>
    </main>
  );
}
