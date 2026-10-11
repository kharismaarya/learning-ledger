import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach } from "vitest";
import { LocalDB } from "../db/localDb";

/* browser APIs jsdom doesn't implement */
Element.prototype.scrollIntoView = function () {};
window.matchMedia = (query: string) =>
  ({ matches: false, media: query, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false }) as MediaQueryList;

if (!Blob.prototype.text)
  Blob.prototype.text = function (this: Blob) {
    return new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = () => reject(r.error);
      r.readAsText(this);
    });
  };

/* every test starts with an empty ledger and no saved preferences */
beforeEach(() => {
  localStorage.clear();
  LocalDB.replaceAll({});
  localStorage.clear();
});
afterEach(() => cleanup());
