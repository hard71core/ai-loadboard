import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import DocsPage from "./DocsPage";

describe("DocsPage", () => {
  it("renders the page heading and intro copy", () => {
    render(<DocsPage />);

    expect(screen.getByRole("heading", { name: "Documentation" })).toBeInTheDocument();
    expect(
      screen.getByText(/this is a demo build, so the internal docs are published in the open/i),
    ).toBeInTheDocument();
  });

  it("renders both doc cards with their title, audience, and body text", () => {
    render(<DocsPage />);

    expect(screen.getByRole("heading", { name: "Project Overview" })).toBeInTheDocument();
    expect(screen.getByText("Investor-facing")).toBeInTheDocument();
    expect(screen.getByText(/the pitch: the problem, the product, the market/i)).toBeInTheDocument();

    expect(screen.getByRole("heading", { name: "Technical Documentation" })).toBeInTheDocument();
    expect(screen.getByText("Engineering spec")).toBeInTheDocument();
    expect(
      screen.getByText(/architecture, data model, api, and a per-feature design/i),
    ).toBeInTheDocument();
  });

  it("points each card's links at its own html/pdf files", () => {
    render(<DocsPage />);

    const openLinks = screen.getAllByRole("link", { name: "Open (UA/EN)" });
    const pdfLinks = screen.getAllByRole("link", { name: "Download PDF" });
    expect(openLinks).toHaveLength(2);
    expect(pdfLinks).toHaveLength(2);

    // DOCS order: Project Overview first, Technical Documentation second.
    expect(openLinks[0]).toHaveAttribute("href", "/docs/project-documentation.html");
    expect(pdfLinks[0]).toHaveAttribute("href", "/docs/project-documentation.pdf");
    expect(openLinks[1]).toHaveAttribute("href", "/docs/technical-documentation.html");
    expect(pdfLinks[1]).toHaveAttribute("href", "/docs/technical-documentation.pdf");
  });

  it("opens every doc link in a new tab without leaking a window.opener reference", () => {
    render(<DocsPage />);

    const allLinks = [
      ...screen.getAllByRole("link", { name: "Open (UA/EN)" }),
      ...screen.getAllByRole("link", { name: "Download PDF" }),
    ];
    expect(allLinks).toHaveLength(4);
    for (const link of allLinks) {
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
    }
  });
});
