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
      <section className="hero">
        <div className="hero-head">
          <div>
            <h1>
              BotCat by FairyPlace helps you create bespoke surface designs for
              fabric, wallpaper, and leather
            </h1>
            <p>
              From concept to approved sketches, you receive private print-on-demand links
              with partners such as Spoonflower, Contrado, and others. The design is free;
              you pay only POD partners for production.
            </p>
          </div>

          <Image
            src="/FP_Logo.png"
            alt="FairyPlace"
            height={44}
            width={160}
            priority
            style={{ width: "auto", height: 44 }}
          />
        </div>
      </section>

      <section className="dashboard">
        <aside className="sidebar">
          <h3>Navigation</h3>
          {NAV_ITEMS.map((item, idx) => (
            <a
              key={item.href}
              href={item.href}
              target="_blank"
              rel="noreferrer"
              className={`nav-item${idx === activeIndex ? " active" : ""}`}
            >
              {item.label}
            </a>
          ))}
        </aside>

        <main className="content">
          <div className="cards">
            <a href="/chat" className="card">
              <div className="card-media">
                <Image
                  src="/BotCat_Portrait_512.png"
                  alt="BotCat  Instant"
                  width={220}
                  height={220}
                  style={{ width: "auto", height: 220 }}
                />
              </div>
              <div className="card-title">
                <strong>BotCat  Instant</strong> Free bespoke surface design consultant
                using proven, cost-efficient AI models. No signup required. Fast concepts and
                sketches, with POD links for production.
              </div>
              <button className="btn-primary" type="button">
                Open v1.0
              </button>
            </a>

            <a href="/chat_pro" className="card">
              <div className="card-media">
                <Image
                  src="/BotCat_PRO_512.png"
                  alt="BotCat  Pro"
                  width={220}
                  height={220}
                  style={{ width: "auto", height: 220 }}
                />
              </div>
              <div className="card-title">
                <strong>BotCat  Pro (signup required)</strong> Free bespoke design
                consultant powered by the latest OpenAI models. Registration required.
                Higher accuracy, deeper iterations, and downloadable transcripts of past
                conversations.
              </div>
              <button className="btn-secondary" type="button">
                View v2.0
              </button>
            </a>
          </div>
        </main>
      </section>
    </main>
  );
}
