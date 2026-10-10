import type { KeyboardEvent } from "react";

export const plural = (n: number, w: string, ws?: string) => n + " " + (n === 1 ? w : ws || w + "s");

export function hostOf(url?: string): string {
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** Ctrl/Cmd+Enter submits the surrounding form */
export function submitOnModEnter(e: KeyboardEvent<HTMLTextAreaElement>) {
  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
    e.preventDefault();
    e.currentTarget.form?.requestSubmit();
  }
}
