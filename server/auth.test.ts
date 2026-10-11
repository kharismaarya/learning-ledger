import { describe, expect, it } from "vitest";
import {
  DUMMY_HASH,
  RateLimiter,
  allowedHosts,
  clearCookie,
  clientIp,
  hashPassword,
  hashToken,
  newSessionToken,
  normEmail,
  passwordProblem,
  readSessionCookie,
  sessionCookie,
  verifyPassword,
} from "./auth.ts";

describe("password hashing", () => {
  const pw = "correct horse battery staple";

  it("verifies the right password and rejects others", async () => {
    const h = await hashPassword(pw);
    expect(h).toMatch(/^scrypt\$32768\$8\$1\$[\w-]{22}\$[\w-]{43}$/);
    expect(h).not.toContain(pw);
    expect(await verifyPassword(pw, h)).toBe(true);
    expect(await verifyPassword(pw + " ", h)).toBe(false);
    expect(await verifyPassword("", h)).toBe(false);
  });

  it("salts every hash, so the same password hashes differently", async () => {
    expect(await hashPassword(pw)).not.toBe(await hashPassword(pw));
  });

  it("handles non-ASCII passwords, whichever way the accents are typed", async () => {
    const h = await hashPassword("pässwörd-ñ-✓");
    expect(await verifyPassword("pässwörd-ñ-✓", h)).toBe(true);
    expect(await verifyPassword("pässwörd-ñ-✓", h)).toBe(true); // same letters, decomposed
  });

  it("rejects malformed or tampered hashes instead of throwing", async () => {
    const h = await hashPassword(pw);
    const parts = h.split("$");
    expect(await verifyPassword(pw, "")).toBe(false);
    expect(await verifyPassword(pw, "plain-text")).toBe(false);
    expect(await verifyPassword(pw, ["bcrypt", ...parts.slice(1)].join("$"))).toBe(false);
    expect(await verifyPassword(pw, [...parts.slice(0, 5), "AAAA"].join("$"))).toBe(false);
    expect(await verifyPassword(pw, [parts[0], "3", ...parts.slice(2)].join("$"))).toBe(false); // N not a power of 2
  });

  it("the dummy hash matches nothing", async () => {
    expect(await verifyPassword("", DUMMY_HASH)).toBe(false);
    expect(await verifyPassword(pw, DUMMY_HASH)).toBe(false);
  });
});

describe("input rules", () => {
  it("normalises emails and rejects things that aren't one", () => {
    expect(normEmail("  Me@Example.COM ")).toBe("me@example.com");
    for (const bad of ["", "me", "me@example", "a b@example.com", "@example.com", null, 5, "x".repeat(250) + "@a.co"]) expect(normEmail(bad)).toBeNull();
  });

  it("asks for long passwords, not complicated ones", () => {
    expect(passwordProblem("short")).toMatch(/at least 10/);
    expect(passwordProblem("✓✓✓✓✓✓✓✓✓")).toMatch(/at least 10/); // 9 characters, counted as characters
    expect(passwordProblem("all lowercase words")).toBeNull();
    expect(passwordProblem("x".repeat(201))).toMatch(/at most 200/);
    expect(passwordProblem(undefined)).toBe("Enter a password.");
  });
});

describe("sessions", () => {
  it("makes long random tokens and stores only their hash", () => {
    const a = newSessionToken();
    expect(a).toMatch(/^[\w-]{43}$/); // 32 bytes
    expect(newSessionToken()).not.toBe(a);
    expect(hashToken(a)).not.toBe(a);
    expect(hashToken(a)).toBe(hashToken(a));
  });

  it("locally, the cookie is HttpOnly and SameSite=Lax, without Secure", () => {
    const c = sessionCookie("tok", false);
    expect(c).toMatch(/^ll_session=tok; /);
    expect(c).toContain("HttpOnly");
    expect(c).toContain("SameSite=Lax");
    expect(c).toContain("Path=/");
    expect(c).toContain(`Max-Age=${30 * 86400}`);
    expect(c).not.toContain("Secure");
  });

  it("over HTTPS, the cookie is Secure with the __Host- prefix", () => {
    expect(sessionCookie("tok", true)).toMatch(/^__Host-ll_session=tok; .*; Secure$/);
    expect(clearCookie(true)).toMatch(/^__Host-ll_session=; .*Max-Age=0; Secure$/);
  });

  it("reads the token back from a Cookie header", () => {
    expect(readSessionCookie("a=1; ll_session=tok; b=2", false)).toBe("tok");
    expect(readSessionCookie("__Host-ll_session=tok", true)).toBe("tok");
    expect(readSessionCookie("ll_session=tok", true)).toBeNull(); // the plain name doesn't count on HTTPS
    expect(readSessionCookie("xll_session=tok", false)).toBeNull();
    expect(readSessionCookie("ll_session=", false)).toBeNull();
    expect(readSessionCookie(undefined, false)).toBeNull();
  });
});

describe("RateLimiter", () => {
  it("blocks a key after the limit, until the window ends", () => {
    const l = new RateLimiter(3, 1000);
    for (let i = 0; i < 3; i++) {
      expect(l.blocked("a", 0)).toBe(false);
      l.hit("a", 0);
    }
    expect(l.blocked("a", 500)).toBe(true);
    expect(l.blocked("b", 500)).toBe(false);
    expect(l.blocked("a", 1000)).toBe(false);
    l.hit("a", 1000);
    expect(l.blocked("a", 1000)).toBe(false);
  });

  it("clear forgets a key", () => {
    const l = new RateLimiter(1, 1000);
    l.hit("a", 0);
    expect(l.blocked("a", 0)).toBe(true);
    l.clear("a");
    expect(l.blocked("a", 0)).toBe(false);
  });
});

describe("clientIp", () => {
  it("uses Cloudflare's header when there is one, and ignores X-Forwarded-For (clients can fake it)", () => {
    expect(clientIp({ "cf-connecting-ip": "1.2.3.4", "x-forwarded-for": "9.9.9.9" }, "10.0.0.1")).toBe("1.2.3.4");
    expect(clientIp({ "x-forwarded-for": "9.9.9.9" }, "10.0.0.1")).toBe("10.0.0.1");
  });
});

describe("allowedHosts", () => {
  it("allows only localhost by default", () => {
    expect([...allowedHosts({})].sort()).toEqual(["127.0.0.1", "localhost"]);
  });

  it("adds Render's hostname when it's set", () => {
    const hosts = allowedHosts({ RENDER_EXTERNAL_HOSTNAME: "Learning-Ledger.onrender.com" });
    expect(hosts.has("learning-ledger.onrender.com")).toBe(true);
    expect(hosts.has("localhost")).toBe(true);
    expect(hosts.has("evil.example")).toBe(false);
  });
});
