import { useCallback, useEffect, useState } from "react";
import { AddEntryForm } from "./components/AddEntryForm";
import { Banner, Toast } from "./components/Banner";
import { GoalPanel } from "./components/GoalPanel";
import { LogPanel } from "./components/LogPanel";
import { MilestonePanel } from "./components/MilestonePanel";
import { NextPanel } from "./components/NextPanel";
import { QuestionsPanel } from "./components/QuestionsPanel";
import { SignInForm } from "./components/SignInForm";
import { TopBar } from "./components/TopBar";
import { TopicsPanel } from "./components/TopicsPanel";
import { me, type Account } from "./db/auth";
import { db } from "./db/db";
import { AppProvider } from "./state/AppContext";

type Session = { state: "checking" } | { state: "offline" } | { state: "signedOut"; notice?: string } | { state: "signedIn"; account: Account };

/** Asks the server who is signed in, then shows the sign-in form or the app. */
export function App() {
  const [session, setSession] = useState<Session>({ state: "checking" });

  const check = useCallback(() => {
    let live = true;
    me().then(
      (account) => live && setSession(account ? { state: "signedIn", account } : { state: "signedOut" }),
      () => live && setSession({ state: "offline" }),
    );
    return () => {
      live = false;
    };
  }, []);
  useEffect(check, [check]);

  const signedOut = useCallback((notice?: string) => {
    db.reset(); // forget the last person's data before anyone else signs in
    setSession({ state: "signedOut", notice });
  }, []);

  if (session.state === "checking") return null;
  if (session.state === "offline")
    return (
      <div className="wrap">
        <div className="banner auth" role="alert">
          <div>Can't reach the server. Check that it's running (npm start) and that you're online.</div>
          <div className="row">
            <button
              className="btn primary"
              onClick={() => {
                setSession({ state: "checking" });
                check();
              }}
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  if (session.state === "signedOut")
    return (
      <div className="wrap">
        <SignInForm notice={session.notice} onSignedIn={(account) => setSession({ state: "signedIn", account })} />
      </div>
    );
  // key: a different account gets a fresh app, so no filter, draft or selection carries over from the last person
  return <Ledger key={session.account.email} account={session.account} onSignedOut={signedOut} />;
}

function Ledger({ account, onSignedOut }: { account: Account; onSignedOut: (notice?: string) => void }) {
  return (
    <AppProvider account={account} onSignedOut={onSignedOut}>
      <div className="wrap">
        <TopBar />
        <Banner />
        <div className="grid">
          <div className="col">
            <GoalPanel />
            <NextPanel />
            <MilestonePanel />
            <QuestionsPanel />
          </div>
          <div className="col">
            <TopicsPanel />
            <AddEntryForm />
            <LogPanel />
          </div>
        </div>
      </div>
      <Toast />
    </AppProvider>
  );
}
