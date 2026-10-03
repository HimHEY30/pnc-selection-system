import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import FormDialog from "./FormDialog";

function Harness({ busy = false, dirty = false, onClosed = () => {} }: { busy?: boolean; dirty?: boolean; onClosed?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Open</button>
      <FormDialog
        open={open}
        title="Add thing"
        description="Fill it in."
        busy={busy}
        dirty={dirty}
        onClose={() => {
          setOpen(false);
          onClosed();
        }}
      >
        <input aria-label="Name" />
      </FormDialog>
    </>
  );
}

describe("FormDialog", () => {
  it("shows nothing until it is opened, then a modal dialog named by its title with its description", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Name")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Open" }));

    expect(screen.getByRole("dialog", { name: "Add thing" })).toBeInTheDocument();
    expect(screen.getByText("Fill it in.")).toBeInTheDocument();
    expect(screen.getByLabelText("Name")).toBeInTheDocument();
  });

  it("closes with the close button and forgets what was typed", async () => {
    const user = userEvent.setup();
    const onClosed = vi.fn();
    render(<Harness onClosed={onClosed} />);
    await user.click(screen.getByRole("button", { name: "Open" }));
    await user.type(screen.getByLabelText("Name"), "typed");

    await user.click(screen.getByRole("button", { name: "Close" }));

    expect(onClosed).toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Open" }));
    expect(screen.getByLabelText("Name")).toHaveValue("");
  });

  it("closes when the backdrop is clicked", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Open" }));

    fireEvent.click(document.querySelector("dialog")!);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("does not close from the close button, the backdrop or Escape while a save is running", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<Harness busy />);
    // Open it first, then make it busy, as a save does.
    rerender(<Harness />);
    await user.click(screen.getByRole("button", { name: "Open" }));
    rerender(<Harness busy />);

    expect(screen.getByRole("button", { name: "Close" })).toBeDisabled();
    fireEvent.click(document.querySelector("dialog")!);
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    const escape = new Event("cancel", { cancelable: true });
    document.querySelector("dialog")!.dispatchEvent(escape);
    expect(escape.defaultPrevented).toBe(true);
  });

  it("lets Escape through when nothing is running", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Open" }));

    const escape = new Event("cancel", { cancelable: true });
    document.querySelector("dialog")!.dispatchEvent(escape);

    expect(escape.defaultPrevented).toBe(false);
  });

  describe("with unsaved changes", () => {
    async function openDirty() {
      const user = userEvent.setup();
      const onClosed = vi.fn();
      render(<Harness dirty onClosed={onClosed} />);
      await user.click(screen.getByRole("button", { name: "Open" }));
      return { user, onClosed };
    }

    it("asks before the close button throws the typing away, and keeps the form on Keep editing", async () => {
      const { user, onClosed } = await openDirty();
      await user.type(screen.getByLabelText("Name"), "typed");

      await user.click(screen.getByRole("button", { name: "Close" }));

      expect(screen.getByRole("dialog", { name: "Discard your changes?" })).toBeInTheDocument();
      expect(onClosed).not.toHaveBeenCalled();

      await user.click(screen.getByRole("button", { name: "Keep editing" }));

      expect(screen.queryByRole("dialog", { name: "Discard your changes?" })).not.toBeInTheDocument();
      expect(screen.getByLabelText("Name")).toHaveValue("typed");
      expect(onClosed).not.toHaveBeenCalled();
    });

    it("closes and forgets the typing on Discard", async () => {
      const { user, onClosed } = await openDirty();
      await user.type(screen.getByLabelText("Name"), "typed");
      await user.click(screen.getByRole("button", { name: "Close" }));

      await user.click(screen.getByRole("button", { name: "Discard" }));

      expect(onClosed).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("asks on a click on the backdrop too", async () => {
      const { onClosed } = await openDirty();

      fireEvent.click(document.querySelector("dialog")!);

      expect(screen.getByRole("dialog", { name: "Discard your changes?" })).toBeInTheDocument();
      expect(onClosed).not.toHaveBeenCalled();
    });

    it("holds Escape back and asks instead", async () => {
      await openDirty();

      const escape = new Event("cancel", { cancelable: true });
      act(() => {
        document.querySelector("dialog")!.dispatchEvent(escape);
      });

      expect(escape.defaultPrevented).toBe(true);
      expect(screen.getByRole("dialog", { name: "Discard your changes?" })).toBeInTheDocument();
    });

    it("does not ask when nothing was changed", async () => {
      const user = userEvent.setup();
      const onClosed = vi.fn();
      render(<Harness onClosed={onClosed} />);
      await user.click(screen.getByRole("button", { name: "Open" }));

      await user.click(screen.getByRole("button", { name: "Close" }));

      expect(onClosed).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });
});
