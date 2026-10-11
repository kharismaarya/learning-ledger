import { describe, expect, it } from "vitest";
import { allowedHosts, checkBasicAuth } from "./auth.ts";

const basic = (userPass: string) => "Basic " + Buffer.from(userPass, "utf8").toString("base64");

describe("checkBasicAuth", () => {
  const pw = "correct horse battery staple";

  it("accepts the right password with any username", () => {
    expect(checkBasicAuth(basic(`me:${pw}`), pw)).toBe(true);
    expect(checkBasicAuth(basic(`:${pw}`), pw)).toBe(true);
    expect(checkBasicAuth(basic(`anything at all:${pw}`), pw)).toBe(true);
  });

  it("rejects a wrong or missing password", () => {
    expect(checkBasicAuth(basic("me:wrong"), pw)).toBe(false);
    expect(checkBasicAuth(basic(`me:${pw} `), pw)).toBe(false);
    expect(checkBasicAuth(basic("me:"), pw)).toBe(false);
    expect(checkBasicAuth(undefined, pw)).toBe(false);
    expect(checkBasicAuth("", pw)).toBe(false);
  });

  it("rejects other schemes and malformed headers", () => {
    expect(checkBasicAuth(`Bearer ${pw}`, pw)).toBe(false);
    expect(checkBasicAuth("Basic", pw)).toBe(false);
    expect(checkBasicAuth("Basic !!!not-base64!!!", pw)).toBe(false);
    expect(checkBasicAuth(basic(pw), pw)).toBe(false); // no colon, so no password part
  });

  it("keeps colons that are part of the password", () => {
    expect(checkBasicAuth(basic("me:a:b:c"), "a:b:c")).toBe(true);
    expect(checkBasicAuth(basic("me:a:b:c"), "b:c")).toBe(false);
  });

  it("handles non-ASCII passwords", () => {
    expect(checkBasicAuth(basic("me:pässwörd-ñ-✓"), "pässwörd-ñ-✓")).toBe(true);
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
