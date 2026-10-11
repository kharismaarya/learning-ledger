import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";
import { db } from "../db/db";
import { fakeApi, fakeFetch } from "./fakeApi";

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

/* the server is replaced by an in-memory fake (fakeApi.ts) */
vi.stubGlobal("fetch", fakeFetch);

/* every test starts with an empty database, an empty cache and no saved preferences */
beforeEach(async () => {
  fakeApi.reset();
  await db.replaceAll({});
  fakeApi.calls = [];
  localStorage.clear();
});
afterEach(() => cleanup());
