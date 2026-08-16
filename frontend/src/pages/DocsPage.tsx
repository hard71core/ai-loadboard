import { DocIcon, ShieldIcon } from "../icons";

/** Static copies of docs/*.html and docs/*.pdf, served from frontend/public/
docs/ — Vite serves that directory as-is at these exact paths, no build step
involved. These are COPIES, not the source of truth: whenever the real
docs/*.html changes and its PDF gets regenerated (see .claude/CLAUDE.md's
"Docs move with the code" rule), the same two files need re-copying here too
or this page silently drifts out of date. */
const DOCS = [
  {
    icon: ShieldIcon,
    title: "Project Overview",
    audience: "Investor-facing",
    body: "The pitch: the problem, the product, the market, and the phased roadmap — in plain business terms, not implementation detail.",
    html: "/docs/project-documentation.html",
    pdf: "/docs/project-documentation.pdf",
  },
  {
    icon: DocIcon,
    title: "Technical Documentation",
    audience: "Engineering spec",
    body: "Architecture, data model, API, and a per-feature design for all 7 planned AI services — including a running, prioritized tech-debt list.",
    html: "/docs/technical-documentation.html",
    pdf: "/docs/technical-documentation.pdf",
  },
];

export default function DocsPage() {
  return (
    <div className="container">
      <div className="page-header">
        <div className="page-header-inner">
          <h1>Documentation</h1>
          <p className="muted">
            This is a demo build, so the internal docs are published in the
            open rather than gated — both the investor-facing overview and
            the full engineering spec, exactly as the team works from them.
          </p>
        </div>
      </div>

      <div className="docs-grid">
        {DOCS.map(({ icon: Icon, title, audience, body, html, pdf }) => (
          <div className="card docs-card" key={title}>
            <span className="docs-card-icon">
              <Icon />
            </span>
            <span className="docs-card-audience">{audience}</span>
            <h2>{title}</h2>
            <p className="muted">{body}</p>
            <div className="docs-card-actions">
              <a className="btn primary small" href={html} target="_blank" rel="noopener noreferrer">
                Open (UA/EN)
              </a>
              <a className="btn small" href={pdf} target="_blank" rel="noopener noreferrer">
                Download PDF
              </a>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
