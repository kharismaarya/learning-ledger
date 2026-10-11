import { useState, type FormEvent } from "react";
import { signIn, signUp, type Account } from "../db/auth";
import type { DbError } from "../db/db";

/** Sign in, or create an account. Shown instead of the app when nobody is signed in. */
export function SignInForm({ onSignedIn, notice }: { onSignedIn: (a: Account) => void; notice?: string }) {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(notice || "");
  const [busy, setBusy] = useState(false);
  const signingUp = mode === "signup";

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    setBusy(true);
    setError("");
    try {
      onSignedIn(await (signingUp ? signUp : signIn)(email, password));
    } catch (e) {
      const err = e as DbError;
      setError(err.code === "server_unavailable" ? "Couldn't reach the server. Is it running, and are you online?" : err.message);
      setBusy(false);
    }
  }

  function switchMode() {
    setMode(signingUp ? "signin" : "signup");
    setError("");
  }

  return (
    <section className="panel auth" aria-label={signingUp ? "Create an account" : "Sign in"}>
      <div className="brand">
        <h1>Learning Ledger</h1>
      </div>
      <h2>{signingUp ? "Create an account" : "Sign in"}</h2>
      <form onSubmit={submit}>
        <div className="field">
          <label className="label" htmlFor="authEmail">
            Email
          </label>
          {/* autoComplete tells password managers what each box is, so they can fill and save them */}
          <input id="authEmail" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="field">
          <label className="label" htmlFor="authPassword">
            Password
          </label>
          <input
            id="authPassword"
            type="password"
            autoComplete={signingUp ? "new-password" : "current-password"}
            required
            minLength={signingUp ? 10 : undefined}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {signingUp && <span className="hint">At least 10 characters. A few unrelated words is long and easy to remember.</span>}
        </div>
        {error && (
          <div className="banner" role="alert">
            {error}
          </div>
        )}
        <div className="row">
          <button className="btn primary" type="submit" disabled={busy}>
            {signingUp ? "Create account" : "Sign in"}
          </button>
          <button className="btn" type="button" onClick={switchMode}>
            {signingUp ? "I already have an account" : "Create an account"}
          </button>
        </div>
        {/* Password reset needs an email service; it's planned (server/mail.ts). */}
      </form>
    </section>
  );
}
