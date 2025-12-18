"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";

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
  {
    label: "Events Organizers",
    href: "https://www.fairyplace.biz/events-organizers",
  },
  { label: "Home Decor", href: "https://www.fairyplace.biz/home-decor" },
  {
    label: "Spas, Fitness, Beauty",
    href: "https://www.fairyplace.biz/spas-fitness-wellness",
  },
  { label: "Privacy Policy", href: "https://www.fairyplace.biz/privacy-policy" },
];

const TM = "\u2122";

export default function HomePage() {
  const [activeIndex, setActiveIndex] = useState<number>(0);

  return (
    <main>
      <section className="hero">
        <div className="hero-head">
          <div>
            <h1>
              {`BotCat${TM} by FairyPlace${TM} helps you create bespoke surface designs for fabric, wallpaper, and leather`}
            </h1>
            <p className="hero-p">
              From concept to approved sketches, you receive print-on-demand links with
              partners such as Spoonflower, Contrado, and others. The design is free; you
              pay only POD partners for production.
            </p>
          </div>

          <Image
            src="/FP_Logo.png"
            alt={`FairyPlace${TM}`}
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
          <nav aria-label="FairyPlace navigation">
            {NAV_ITEMS.map((item, idx) => (
              <a
                key={item.href}
                href={item.href}
                target="_blank"
                rel="noopener noreferrer"
                className={`nav-item${idx === activeIndex ? " active" : ""}`}
                onClick={() => setActiveIndex(idx)}
              >
                {item.label}
              </a>
            ))}
          </nav>
        </aside>

        <main className="content">
          <div className="cards">
            <div className="card card--square card--instant" aria-label="BotCat Instant">
              <div className="card-media">
                <Image
                  src="/BotCat_Portrait_512.png"
                  alt={`BotCat${TM} Instant`}
                  width={173}
                  height={173}
                  style={{ width: "auto", height: 173 }}
                />
              </div>
              <div className="card-title">
                <strong>{`BotCat${TM} Instant`}</strong> Free bespoke surface design consultant using
                proven, cost-efficient AI models. No signup required. Fast concepts and
                sketches.
              </div>
              <div className="card-actions">
                <Link className="btn-primary" href="/chat">
                  Open v1.0
                </Link>
              </div>
            </div>

            <div className="card card--square" aria-label="BotCat Pro">
              <div className="card-media">
                <Image
                  src="/BotCat_PRO_512.png"
                  alt={`BotCat${TM} Pro`}
                  width={173}
                  height={173}
                  style={{ width: "auto", height: 173 }}
                />
              </div>
              <div className="card-title">
                <strong>{`BotCat${TM} Pro (signup required)`}</strong> Free bespoke design consultant
                powered by the latest OpenAI models. Registration required. Higher accuracy,
                deeper iterations, and downloadable transcripts of past conversations.
              </div>
              <div className="card-actions">
                <Link className="btn-secondary" href="/chat_pro">
                  View v2.0
                </Link>
              </div>
            </div>
          </div>
        </main>
      </section>
    </main>
  );
}
