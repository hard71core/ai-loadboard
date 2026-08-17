import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import Combobox from "./Combobox";

const OPTIONS = [
  { value: "TX", label: "Texas" },
  { value: "TN", label: "Tennessee" },
  { value: "CA", label: "California" },
];

function syncSearch(query: string) {
  const q = query.trim().toLowerCase();
  return q ? OPTIONS.filter((o) => o.label.toLowerCase().includes(q)) : OPTIONS;
}

describe("Combobox", () => {
  it("shows every option on focus with no query typed yet (minChars=0 default)", async () => {
    const user = userEvent.setup({ delay: null });
    render(<Combobox placeholder="Search…" value="" search={syncSearch} onSelect={vi.fn()} />);

    await user.click(screen.getByRole("combobox"));
    expect(await screen.findByRole("option", { name: "Texas" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Tennessee" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "California" })).toBeInTheDocument();
  });

  it("filters as you type and calls onSelect with the clicked option", async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup({ delay: null });
    render(<Combobox placeholder="Search…" value="" search={syncSearch} onSelect={onSelect} />);

    await user.type(screen.getByRole("combobox"), "Te");
    await waitFor(() => {
      expect(screen.getByRole("option", { name: "Texas" })).toBeInTheDocument();
      expect(screen.getByRole("option", { name: "Tennessee" })).toBeInTheDocument();
    });
    expect(screen.queryByRole("option", { name: "California" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("option", { name: "Tennessee" }));
    expect(onSelect).toHaveBeenCalledWith({ value: "TN", label: "Tennessee" });
  });

  it("respects minChars — no search fires below the threshold", async () => {
    const search = vi.fn().mockReturnValue([]);
    const user = userEvent.setup({ delay: null });
    render(
      <Combobox placeholder="Search…" value="" minChars={2} search={search} onSelect={vi.fn()} />,
    );

    await user.type(screen.getByRole("combobox"), "T");
    expect(search).not.toHaveBeenCalled();

    await user.type(screen.getByRole("combobox"), "e");
    await waitFor(() => expect(search).toHaveBeenCalledWith("Te"));
  });

  it("debounces an async source — only the last keystroke's search actually resolves into results", async () => {
    const search = vi.fn(
      (query: string) =>
        new Promise<{ value: string; label: string }[]>((resolve) =>
          setTimeout(() => resolve(syncSearch(query)), 10),
        ),
    );
    const user = userEvent.setup({ delay: null });
    render(
      <Combobox
        placeholder="Search…"
        value=""
        minChars={2}
        debounceMs={200}
        search={search}
        onSelect={vi.fn()}
      />,
    );

    const input = screen.getByRole("combobox");
    await user.type(input, "Tex");

    // Nothing fires until the debounce window has passed, and it only fires
    // once for the whole burst of keystrokes, not once per character.
    expect(search).not.toHaveBeenCalled();
    await waitFor(() => expect(search).toHaveBeenCalledTimes(1), { timeout: 1000 });
    expect(search).toHaveBeenCalledWith("Tex");
    expect(await screen.findByRole("option", { name: "Texas" })).toBeInTheDocument();
  });

  it("shows nothing and never calls search while disabled", async () => {
    const search = vi.fn().mockReturnValue([]);
    const user = userEvent.setup({ delay: null });
    render(
      <Combobox
        placeholder="Search…"
        disabled
        disabledPlaceholder="Pick something else first"
        value=""
        search={search}
        onSelect={vi.fn()}
      />,
    );

    const input = screen.getByRole("combobox");
    expect(input).toBeDisabled();
    expect(input).toHaveAttribute("placeholder", "Pick something else first");
    await user.click(input);
    expect(search).not.toHaveBeenCalled();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("navigates with the keyboard and commits the highlighted option on Enter", async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup({ delay: null });
    render(<Combobox placeholder="Search…" value="" search={syncSearch} onSelect={onSelect} />);

    const input = screen.getByRole("combobox");
    await user.click(input);
    await screen.findByRole("option", { name: "Texas" });

    await user.keyboard("{ArrowDown}{ArrowDown}{Enter}"); // Texas -> Tennessee -> California
    expect(onSelect).toHaveBeenCalledWith({ value: "CA", label: "California" });
  });
});
