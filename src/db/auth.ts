/* Signing in and out. The server keeps the session in an HttpOnly cookie, which this code never sees or touches:
   the browser stores it and sends it with every /api request by itself. That's the point of HttpOnly: even a script
   injected into the page couldn't read the session and send it somewhere else. */
import { api, db } from "./db";

export interface Account {
  email: string;
}

/** The signed-in account, or null when nobody is signed in. Errors (server down) are thrown. */
export async function me(): Promise<Account | null> {
  const { email } = await api<{ email: string | null }>("GET", "/auth/me");
  return email ? { email } : null;
}

export const signIn = (email: string, password: string) => api<Account>("POST", "/auth/signin", { email, password });

export const signUp = (email: string, password: string) => api<Account>("POST", "/auth/signup", { email, password });

/** Ends the session on the server, then clears this tab's copy of the data. If the server can't be reached this
    throws and changes nothing: only the server can remove an HttpOnly cookie, so you'd still be signed in. */
export async function signOut(): Promise<void> {
  await api("POST", "/auth/signout", {});
  db.reset();
}
