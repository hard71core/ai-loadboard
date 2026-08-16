import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchLoads } from "../api";
import { useAuth } from "../AuthContext";
import { useCountUp } from "../hooks/useCountUp";
import { BoltIcon, ClockIcon, PackageIcon, RouteIcon, SearchIcon, SparkleIcon } from "../icons";
import type { Load } from "../types";

interface Props {
  openAuth: (mode: "login" | "register") => void;
}

const VALUE_PROPS = [
  {
    icon: BoltIcon,
    title: "Zero broker markup",
    body: "Shippers and carriers deal directly — no middleman taking a cut of every load.",
  },
  {
    icon: SearchIcon,
    title: "Describe it, don't filter it",
    body: "“Reefer out of Dallas under 900” finds loads instantly — no dropdown maze.",
  },
  {
    icon: SparkleIcon,
    title: "Recommendations, not a wall of listings",
    body: "Carriers see loads ranked against the lanes and equipment they actually run.",
  },
  {
    icon: ClockIcon,
    title: "Real arrival windows",
    body: "Live driving distance and an accepted-to-delivered estimate, not a guess.",
  },
];

const FEATURES = [
  {
    icon: SearchIcon,
    title: "Natural-language search",
    body: "Claude turns a plain-English query into a structured filter over the board — origin, equipment, price ceiling, all in one line.",
  },
  {
    icon: SparkleIcon,
    title: "Smart load matching",
    body: "Every open load gets ranked against a carrier's own history — equipment types and lanes they've actually run before.",
  },
  {
    icon: ClockIcon,
    title: "Arrival-time estimate",
    body: "Real driving distance and duration, widened into an arrival window the moment a carrier accepts a load.",
  },
];

const STEPS = [
  {
    label: "01",
    title: "Post it",
    body: "A shipper lists a load — route, equipment, weight, rate — in under a minute.",
  },
  {
    label: "02",
    title: "Match it",
    body: "Search or AI-ranked recommendations put it in front of the right carrier, not every carrier.",
  },
  {
    label: "03",
    title: "Move it",
    body: "The carrier accepts directly and tracks the real route and arrival window to delivery.",
  },
];

export default function HomePage({ openAuth }: Props) {
  const { user } = useAuth();
  const [loads, setLoads] = useState<Load[]>([]);

  useEffect(() => {
    fetchLoads()
      .then(setLoads)
      .catch(() => setLoads([]));
  }, []);

  const openCount = loads.filter((l) => l.status === "open").length;
  const totalCount = useCountUp(loads.length);
  const animatedOpenCount = useCountUp(openCount);

  return (
    <>
      <section className="hero">
        <div className="hero-glow" aria-hidden="true">
          <span></span>
          <span></span>
          <span></span>
        </div>
        <div className="hero-inner">
          <span className="eyebrow">
            <span className="dot"></span>
            <span className="eyebrow-text">AI-matched freight, zero broker markup</span>
          </span>
          <h1>
            Post it. Match it. <span className="gradient-text">Move it.</span>
          </h1>
          <p className="hero-sub">
            Shippers and carriers connect directly — natural-language search and
            AI-ranked recommendations do the dispatcher's job, so freight moves
            faster and margin stays where it belongs.
          </p>
          <div className="hero-cta">
            <Link className="btn primary" to="/loads">
              Browse loads
            </Link>
            {!user && (
              <button className="btn" onClick={() => openAuth("register")}>
                Sign up free
              </button>
            )}
          </div>
          <div className="stats">
            <div className="stat">
              <span className="stat-icon">
                <PackageIcon />
              </span>
              <div>
                <div className="stat-value">{totalCount}</div>
                <div className="stat-label">Total loads</div>
              </div>
            </div>
            <div className="stat">
              <span className="stat-icon">
                <BoltIcon />
              </span>
              <div>
                <div className="stat-value">{animatedOpenCount}</div>
                <div className="stat-label">Open now</div>
              </div>
            </div>
            <div className="stat">
              <span className="stat-icon">
                <SparkleIcon />
              </span>
              <div>
                <div className="stat-value">0%</div>
                <div className="stat-label">Broker markup</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="container">
        <section className="section">
          <div className="section-head">
            <span className="section-kicker">Why AI Loadboard</span>
            <h2>Built to cut the dispatcher's busywork, not add to it</h2>
          </div>
          <div className="value-grid">
            {VALUE_PROPS.map(({ icon: Icon, title, body }) => (
              <div className="value-card" key={title}>
                <span className="value-icon">
                  <Icon />
                </span>
                <h3>{title}</h3>
                <p className="muted">{body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="section">
          <div className="section-head">
            <span className="section-kicker">What's live today</span>
            <h2>Three AI features, shipped and running</h2>
            <p className="muted">
              Deterministic heuristics today, upgrading to learned models once
              there's real usage data to train them on — see the technical
              docs for exactly where each one stands.
            </p>
          </div>
          <div className="feature-grid">
            {FEATURES.map(({ icon: Icon, title, body }) => (
              <div className="feature-card" key={title}>
                <span className="feature-icon">
                  <Icon />
                </span>
                <h3>
                  {title} <span className="mvp-tag">MVP</span>
                </h3>
                <p className="muted">{body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="section">
          <div className="section-head">
            <span className="section-kicker">How it works</span>
            <h2>Three steps, no broker in between</h2>
          </div>
          <div className="steps">
            {STEPS.map((step) => (
              <div className="step" key={step.label}>
                <span className="step-label">{step.label}</span>
                <h3>{step.title}</h3>
                <p className="muted">{step.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="cta-band">
          <RouteIcon className="cta-band-icon" />
          <div>
            <h2>Ready to move freight without the markup?</h2>
            <p className="muted">
              Post a load as a shipper, or sign up as a carrier and let matching
              find the lanes worth your time.
            </p>
          </div>
          <div className="hero-cta">
            <Link className="btn primary" to="/loads">
              Browse loads
            </Link>
            {!user && (
              <button className="btn" onClick={() => openAuth("register")}>
                Sign up free
              </button>
            )}
          </div>
        </section>
      </div>
    </>
  );
}
