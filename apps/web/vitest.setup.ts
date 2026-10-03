import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => {
  cleanup();
});

// jsdom does not implement the modal parts of <dialog>. This stand-in reproduces what the
// create-campaign dialog relies on: showModal() opens it and close() closes it and fires
// the "close" event. (The real browser also traps focus; that part is browser behaviour,
// not something these tests can prove.)
if (typeof HTMLDialogElement !== "undefined") {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    if (!this.hasAttribute("open")) return;
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
}

// jsdom has no layout, so scrollIntoView does not exist.
Element.prototype.scrollIntoView ??= function scrollIntoView() {};
