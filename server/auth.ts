/* The single-password gate for the deployed app (HTTP Basic Auth), and the list of hostnames the API answers to.
   Pure functions with no server state, so server/auth.test.ts can check them without starting anything. */
import { createHash, timingSafeEqual } from "node:crypto";

const sha256 = (s: string) => createHash("sha256").update(s, "utf8").digest();

/** True if an `Authorization: Basic …` header carries `password`. The username is ignored: there's only one password. */
export function checkBasicAuth(header: string | undefined, password: string): boolean {
  const m = /^Basic\s+([A-Za-z0-9+/=]+)\s*$/i.exec(header || "");
  if (!m) return false;
  const decoded = Buffer.from(m[1], "base64").toString("utf8");
  const colon = decoded.indexOf(":");
  if (colon < 0) return false;
  // Comparing hashes makes both sides the same length, and timingSafeEqual takes the same time whether the first
  // or the last character is wrong, so response times give nothing away about how close a guess was.
  return timingSafeEqual(sha256(decoded.slice(colon + 1)), sha256(password));
}

/** Hostnames the API accepts in the Host header. Render sets RENDER_EXTERNAL_HOSTNAME (e.g. learning-ledger.onrender.com). */
export function allowedHosts(env: Record<string, string | undefined>): Set<string> {
  const hosts = new Set(["localhost", "127.0.0.1"]);
  if (env.RENDER_EXTERNAL_HOSTNAME) hosts.add(env.RENDER_EXTERNAL_HOSTNAME.toLowerCase());
  return hosts;
}
