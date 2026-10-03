/* eslint-disable @next/next/no-html-link-for-pages -- the guard is tested with plain anchors on purpose */
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { useUnsavedChangesGuard } from "@/lib/hooks/useUnsavedChangesGuard";
import Button from "./Button";
import ConfirmDialog from "./ConfirmDialog";
import Switch from "./Switch";

describe("Switch", () => {
  function Harness({ initial = false, disabled = false }) {
    const [on, setOn] = useState(initial);
    return <Switch checked={on} onChange={setOn} label="Rule is active" disabled={disabled} />;
  }

  it("is a switch with its state and label", () => {
    render(<Harness initial />);

    const toggle = screen.getByRole("switch", { name: "Rule is active" });
    expect(toggle).toBeChecked();
  });

  it("flips with a click, and with Space and Enter from the keyboard", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const toggle = screen.getByRole("switch");

    await user.click(toggle);
    expect(toggle).toBeChecked();

    toggle.focus();
    await user.keyboard(" ");
    expect(toggle).not.toBeChecked();

    await user.keyboard("{Enter}");
    expect(toggle).toBeChecked();
  });

  it("cannot be flipped when disabled", async () => {
    const user = userEvent.setup();
    render(<Harness disabled />);

    await user.click(screen.getByRole("switch"));

    expect(screen.getByRole("switch")).not.toBeChecked();
    expect(screen.getByRole("switch")).toBeDisabled();
  });
});

describe("Button", () => {
  it("is a plain button by default, so it never submits a form by accident", () => {
    render(<Button>Save</Button>);

    expect(screen.getByRole("button", { name: "Save" })).toHaveAttribute("type", "button");
  });

  it("never puts white text on a light fill", () => {
    render(
      <>
        <Button variant="primary">A</Button>
        <Button variant="secondary">B</Button>
        <Button variant="danger">C</Button>
      </>,
    );

    expect(screen.getByText("A").className).toContain("bg-primary");
    expect(screen.getByText("C").className).toContain("bg-danger-strong");
    expect(screen.getByText("B").className).not.toContain("text-white");
  });
});

describe("ConfirmDialog", () => {
  const props = {
    title: "Delete this rule?",
    description: "This cannot be undone.",
    confirmLabel: "Delete rule",
    cancelLabel: "Keep rule",
  };

  it("is a dialog with a title and a description", () => {
    render(<ConfirmDialog open {...props} onConfirm={() => {}} onCancel={() => {}} />);

    const dialog = screen.getByRole("dialog", { name: "Delete this rule?" });
    expect(dialog).toHaveAccessibleDescription("This cannot be undone.");
  });

  it("is not shown until it is opened", () => {
    render(<ConfirmDialog open={false} {...props} onConfirm={() => {}} onCancel={() => {}} />);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("starts with focus on Cancel, so a stray Enter cannot confirm", () => {
    render(<ConfirmDialog open {...props} destructive onConfirm={() => {}} onCancel={() => {}} />);

    expect(screen.getByRole("button", { name: "Keep rule" })).toHaveFocus();
  });

  it("confirms only when the confirm button is pressed", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<ConfirmDialog open {...props} onConfirm={onConfirm} onCancel={onCancel} />);

    await user.click(screen.getByRole("button", { name: "Delete rule" }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("cancels from the cancel button", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<ConfirmDialog open {...props} onConfirm={onConfirm} onCancel={onCancel} />);

    await user.click(screen.getByRole("button", { name: "Keep rule" }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("styles a destructive confirm in red", () => {
    render(<ConfirmDialog open {...props} destructive onConfirm={() => {}} onCancel={() => {}} />);

    expect(screen.getByRole("button", { name: "Delete rule" }).className).toContain("bg-danger-strong");
  });
});

describe("useUnsavedChangesGuard", () => {
  function Page({ dirty, onLeave }: { dirty: boolean; onLeave?: (href: string | null) => void }) {
    const { pendingHref, stay, leave } = useUnsavedChangesGuard(dirty);
    return (
      <>
        <a href="/admin/campaigns/abc">Overview</a>
        <a href="/admin/campaigns/abc?x=1#top">With query</a>
        <a href="/current" aria-label="same page">Same page</a>
        <a href="https://example.com/">Elsewhere</a>
        <a href="/admin" target="_blank">New tab</a>
        <p data-testid="pending">{pendingHref ?? "none"}</p>
        <button type="button" onClick={stay}>Stay</button>
        <button type="button" onClick={() => onLeave?.(leave())}>Leave</button>
      </>
    );
  }

  /**
   * Clicks a link and reports whether the guard stopped the click. A listener further along
   * the way (bubbling) sees the click only if the guard let it through; it also cancels the
   * browser's navigation, which jsdom cannot perform.
   */
  function click(name: string, init: MouseEventInit = {}) {
    let reachedBubble = false;
    let prevented = false;
    const spy = (e: Event) => {
      reachedBubble = true;
      prevented = e.defaultPrevented;
      e.preventDefault();
    };
    document.addEventListener("click", spy);
    act(() => {
      screen.getByText(name).dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0, ...init }));
    });
    document.removeEventListener("click", spy);
    return { blocked: !reachedBubble || prevented };
  }

  it("stops a click on an internal link while there are unsaved changes, and remembers where it led", () => {
    render(<Page dirty />);

    const result = click("Overview");

    expect(result.blocked).toBe(true);
    expect(screen.getByTestId("pending")).toHaveTextContent("/admin/campaigns/abc");
  });

  it("keeps the query and hash of the link", () => {
    render(<Page dirty />);

    click("With query");

    expect(screen.getByTestId("pending")).toHaveTextContent("/admin/campaigns/abc?x=1#top");
  });

  it("lets every click through when nothing is unsaved", () => {
    render(<Page dirty={false} />);

    const result = click("Overview");

    expect(result.blocked).toBe(false);
    expect(screen.getByTestId("pending")).toHaveTextContent("none");
  });

  it("leaves new-tab clicks, modified clicks and other sites to the browser", () => {
    render(<Page dirty />);

    expect(click("New tab").blocked).toBe(false);
    expect(click("Overview", { ctrlKey: true }).blocked).toBe(false);
    expect(click("Overview", { metaKey: true }).blocked).toBe(false);
    expect(click("Overview", { button: 1 }).blocked).toBe(false);
    expect(click("Elsewhere").blocked).toBe(false);
    expect(screen.getByTestId("pending")).toHaveTextContent("none");
  });

  it("forgets the link when the user chooses to stay", async () => {
    const user = userEvent.setup();
    render(<Page dirty />);
    click("Overview");

    await user.click(screen.getByRole("button", { name: "Stay" }));

    expect(screen.getByTestId("pending")).toHaveTextContent("none");
  });

  it("hands the link back when the user chooses to leave", async () => {
    const user = userEvent.setup();
    const onLeave = vi.fn();
    render(<Page dirty onLeave={onLeave} />);
    click("Overview");

    await user.click(screen.getByRole("button", { name: "Leave" }));

    expect(onLeave).toHaveBeenCalledWith("/admin/campaigns/abc");
    expect(screen.getByTestId("pending")).toHaveTextContent("none");
  });

  it("asks the browser to confirm closing the tab only while there are unsaved changes", () => {
    const { rerender } = render(<Page dirty />);
    const unsaved = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(unsaved);
    expect(unsaved.defaultPrevented).toBe(true);

    rerender(<Page dirty={false} />);
    const clean = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(clean);
    expect(clean.defaultPrevented).toBe(false);
  });

  it("stops guarding once the changes are saved", () => {
    const { rerender } = render(<Page dirty />);
    rerender(<Page dirty={false} />);

    expect(click("Overview").blocked).toBe(false);
  });
});
