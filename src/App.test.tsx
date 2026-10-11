import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import backup from "../data/learning-ledger-2026-10-10.json";
import { App } from "./App";
import { KEY, MOVED_KEY, db } from "./db/db";
import { norm } from "./db/format";
import { ME, fakeApi } from "./test/fakeApi";
import type { Entry, Milestone } from "./types";

const saved = () => fakeApi.data as unknown as { entries: Entry[]; milestones: Milestone[]; topics: { name: string }[] };
const byId = (id: string) => document.getElementById(id)!;
const toast = (text: string | RegExp) => waitFor(() => expect(byId("toast")).toHaveTextContent(text));

/** The server holds the backup; the app loads it like it would on a real start. */
async function withBackup() {
  fakeApi.data = norm(structuredClone(backup));
  const user = userEvent.setup();
  render(<App />);
  await screen.findByRole("heading", { name: /Build a web app with Claude Code/ });
  return user;
}

describe("Learning Ledger app", () => {
  it("starts empty and creates a first track", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole("button", { name: "Start a track" }));
    await user.type(screen.getByLabelText("Track name"), "Learn Git");
    await user.type(screen.getByLabelText("Outcome — I can…"), "I can branch and merge");
    await user.click(screen.getByRole("button", { name: "Create track" }));
    await toast("Track created");
    expect(screen.getByRole("button", { name: "Learn Git", pressed: true })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "I can branch and merge" })).toBeInTheDocument();
    // a new track has no topics, so the log form offers to create one
    expect(screen.getByLabelText(/^Topic/)).toHaveValue("__new");
  });

  it("imports a backup file from the Import button", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText("No learning track yet");
    const file = new File([JSON.stringify(backup)], "backup.json", { type: "application/json" });
    await user.upload(byId("importFile") as HTMLInputElement, file);
    await toast("Imported 1 track and 15 entries");
    expect(byId("logCount")).toHaveTextContent("15 entries");
    expect(byId("msCount")).toHaveTextContent("1 of 8 done");
  });

  it("asks before an import replaces existing data", async () => {
    const user = await withBackup();
    await user.upload(byId("importFile") as HTMLInputElement, new File([JSON.stringify({ ...backup, entries: [] })], "small.json"));
    expect(await screen.findByText(/Replace what's in the database \(1 track, 15 entries\)/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(db.counts().entries).toBe(15);
  });

  it("rejects a file that isn't a Ledger backup", async () => {
    const user = await withBackup();
    await user.upload(byId("importFile") as HTMLInputElement, new File(["{nope"], "bad.json"));
    expect(await screen.findByText(/isn't valid JSON/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "OK" }));
    await user.upload(byId("importFile") as HTMLInputElement, new File([JSON.stringify({ app: "other" })], "other.json"));
    expect(await screen.findByText(/isn't a Learning Ledger file/)).toBeInTheDocument();
    expect(db.counts().entries).toBe(15);
  });

  it("logs an entry only once a topic is picked, and saves it", async () => {
    const user = await withBackup();
    await user.type(byId("addText"), "Learnt about hooks");
    await user.click(screen.getByRole("button", { name: "Add to log" }));
    await toast("Pick a topic for this entry.");

    await user.selectOptions(byId("addTopic"), "planning");
    await user.click(screen.getByRole("button", { name: "Add to log" }));
    await toast("Logged");
    expect(byId("logCount")).toHaveTextContent("16 entries");
    expect(saved().entries.find((e) => e.text === "Learnt about hooks")).toMatchObject({ type: "insight", topicId: "planning", trackId: "webapp" });
    // the form clears and remembers the topic for next time
    expect(byId("addText")).toHaveValue("");
    expect(byId("addTopic")).toHaveValue("planning");
  });

  it("switches to Source when a link is pasted, unless a type was picked", async () => {
    const user = await withBackup();
    await user.type(byId("addUrl"), "https://example.com");
    expect(within(byId("typePick")).getByRole("button", { name: "Source" })).toHaveAttribute("aria-pressed", "true");

    await user.clear(byId("addUrl"));
    await user.click(within(byId("typePick")).getByRole("button", { name: "Question" }));
    await user.type(byId("addUrl"), "https://example.com");
    expect(within(byId("typePick")).getByRole("button", { name: "Question" })).toHaveAttribute("aria-pressed", "true");
  });

  it("creates a new topic while logging", async () => {
    const user = await withBackup();
    await user.selectOptions(byId("addTopic"), "__new");
    await user.type(byId("addTopicNew"), "React");
    await user.type(byId("addText"), "useState basics");
    await user.click(screen.getByRole("button", { name: "Add to log" }));
    await toast("Logged");
    expect(saved().topics.map((t) => t.name)).toContain("React");
    await waitFor(() => expect(byId("addTopic")).toHaveDisplayValue("React"));
  });

  it("a Build entry can complete its milestone, which logs it and starts the next one", async () => {
    const user = await withBackup();
    await user.selectOptions(byId("addTopic"), "claude-code");
    await user.click(within(byId("typePick")).getByRole("button", { name: "Build" }));
    // Build pre-selects the milestone in progress (m2)
    expect(byId("addMs")).toHaveValue("m2");
    await user.click(screen.getByLabelText(/This completes the milestone/));
    await user.type(byId("addText"), "Static page runs locally");
    await user.click(screen.getByRole("button", { name: "Add to log" }));

    await toast("Milestone reached. What's the first step for the next one?");
    const ms = saved().milestones;
    expect(ms.find((m) => m.id === "m2")).toMatchObject({ status: "done" });
    expect(ms.find((m) => m.id === "m3")).toMatchObject({ status: "doing" });
    expect(saved().entries.find((e) => e.id === "ms-m2")).toMatchObject({ type: "milestone", text: expect.stringMatching(/^Reached milestone: /) });
    expect(saved().entries.find((e) => e.text === "Static page runs locally")).toMatchObject({ type: "build", milestoneId: "m2" });
    await waitFor(() => expect(document.activeElement).toBe(byId("nextInput")));
  });

  it("reopening a done milestone removes its milestone entry", async () => {
    const user = await withBackup();
    // m1 is done; its status button cycles done → todo
    await user.click(screen.getByRole("button", { name: /Set up the toolkit.*: done\. Change status/ }));
    await waitFor(() => expect(saved().entries.some((e) => e.id === "ms-m1")).toBe(false));
    expect(saved().milestones.find((m) => m.id === "m1")).toMatchObject({ status: "todo", doneAt: "" });
  });

  it("saves the next step when Enter is pressed", async () => {
    const user = await withBackup();
    const input = byId("nextInput");
    await user.clear(input);
    await user.type(input, "Write the README{Enter}");
    await toast("Next step saved");
    expect(saved().milestones.find((m) => m.id === "m2")?.nextStep).toBe("Write the README");
  });

  it("won't delete a topic that still has entries", async () => {
    const user = await withBackup();
    const row = screen.getByText("Planning & app idea", { selector: ".topic-name" }).closest(".topic") as HTMLElement;
    await user.click(within(row).getByRole("button", { name: "Delete" }));
    await toast("Move or delete its 3 entries first.");
    expect(within(row).queryByRole("button", { name: "Confirm" })).toBeNull();
  });

  it("deletes an entry only after confirming", async () => {
    const user = await withBackup();
    const article = screen.getByText("App Design Notes").closest("article") as HTMLElement;
    await user.click(within(article).getByRole("button", { name: "Delete" }));
    expect(db.counts().entries).toBe(15);
    await user.click(within(article).getByRole("button", { name: "Confirm delete" }));
    await toast("Entry deleted");
    expect(db.counts().entries).toBe(14);
  });

  it("answers an open question with Ctrl+Enter", async () => {
    const user = await withBackup();
    await user.selectOptions(byId("addTopic"), "planning");
    await user.click(within(byId("typePick")).getByRole("button", { name: "Question" }));
    await user.type(byId("addText"), "What is JSX?");
    await user.click(screen.getByRole("button", { name: "Add to log" }));
    const q = (await screen.findByText("What is JSX?", { selector: "#qList span" })).closest("li") as HTMLElement;

    await user.click(within(q).getByRole("button", { name: "Answer" }));
    await user.keyboard("HTML-like syntax for React{Control>}{Enter}{/Control}");
    await toast("Answer saved");
    expect(saved().entries.find((e) => e.text === "What is JSX?")).toMatchObject({ resolved: true, answer: "HTML-like syntax for React" });
    expect(document.getElementById("qPanel")).toBeNull();
  });

  it("edits an entry in place", async () => {
    const user = await withBackup();
    const article = screen.getByText("App Design Notes").closest("article") as HTMLElement;
    await user.click(within(article).getByRole("button", { name: "Edit" }));
    const text = byId("ed_text");
    expect(document.activeElement).toBe(text);
    await user.clear(text);
    await user.type(text, "App design notes v2");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await toast("Entry updated");
    expect(screen.getByText("App design notes v2")).toBeInTheDocument();
  });

  it("filters the log by search, type and topic", async () => {
    const user = await withBackup();
    const entries = () => byId("log").querySelectorAll("article.entry").length;
    expect(entries()).toBe(15);

    await user.type(byId("logSearch"), "youtube");
    expect(entries()).toBe(1);
    await user.clear(byId("logSearch"));

    await user.click(within(byId("filters")).getByRole("button", { name: /^Source/ }));
    expect(entries()).toBe(3);
    await user.click(within(byId("filters")).getByRole("button", { name: /^All/ }));

    await user.click(screen.getByText("Planning & app idea", { selector: ".topic-name" }));
    expect(entries()).toBe(3);
    expect(within(byId("filters")).getByRole("button", { name: /Topic: Planning & app idea/ })).toBeInTheDocument();
    // "By topic" makes no sense while one topic is selected
    expect(within(byId("viewSeg")).getByRole("button", { name: "By topic" })).toBeDisabled();
  });

  it("moves data saved by the browser-only version into an empty database, once", async () => {
    localStorage.setItem(KEY, JSON.stringify(backup));
    render(<App />);
    await toast("Moved your browser data into your account");
    expect(byId("logCount")).toHaveTextContent("15 entries");
    expect(saved().entries).toHaveLength(15);
    // the browser copy stays as a spare
    expect(localStorage.getItem(KEY)).not.toBeNull();
  });

  it("doesn't move browser data when the database already has data", async () => {
    fakeApi.data = norm({ ...backup, entries: backup.entries.slice(0, 2) });
    localStorage.setItem(KEY, JSON.stringify(backup));
    render(<App />);
    await screen.findByRole("heading", { name: /Build a web app with Claude Code/ });
    expect(fakeApi.calls).not.toContain("PUT /api/ledger");
    expect(byId("logCount")).toHaveTextContent("2 entries");
  });

  it("says so when the server can't be reached, and loads on Retry", async () => {
    fakeApi.data = norm(structuredClone(backup));
    fakeApi.fail = "network";
    const user = userEvent.setup();
    render(<App />);
    expect(await screen.findByText(/Can't reach the server/)).toBeInTheDocument();
    fakeApi.fail = null;
    await user.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(byId("logCount")).toHaveTextContent("15 entries"));
    expect(screen.queryByText(/Can't reach the server/)).toBeNull();
  });

  it("a write the server can't save shows a toast and leaves the screen unchanged", async () => {
    const user = await withBackup();
    await user.selectOptions(byId("addTopic"), "planning");
    await user.type(byId("addText"), "Not saved");
    fakeApi.fail = 503;
    await user.click(screen.getByRole("button", { name: "Add to log" }));
    await toast(/Couldn't reach the server/);
    expect(byId("logCount")).toHaveTextContent("15 entries");
    // the draft is kept so it can be sent again
    expect(byId("addText")).toHaveValue("Not saved");
  });

  it("groups the log by topic and by milestone", async () => {
    const user = await withBackup();
    await user.click(within(byId("viewSeg")).getByRole("button", { name: "By topic" }));
    const topicHeads = [...byId("log").querySelectorAll(".group-h h3")].map((h) => h.textContent);
    expect(topicHeads).toEqual(expect.arrayContaining(["Claude Code Tutorial", "Planning & app idea", "Milestones reached"]));

    await user.click(within(byId("viewSeg")).getByRole("button", { name: "By milestone" }));
    const msHeads = [...byId("log").querySelectorAll(".group-h h3")].map((h) => h.textContent);
    expect(msHeads[0]).toMatch(/^Set up the toolkit/);
    expect(msHeads).toContain("Not linked to a milestone");
    expect(localStorage.getItem("ll.view")).toBe("milestone");
  });
});

describe("Accounts", () => {
  /** Fill in the sign-in form (or the create-account form, if it's showing) and submit it. */
  async function fillAuth(user: ReturnType<typeof userEvent.setup>, email: string, password: string, button: string) {
    await user.type(await screen.findByLabelText("Email"), email);
    await user.type(screen.getByLabelText("Password"), password);
    await user.click(screen.getByRole("button", { name: button }));
  }

  it("asks you to sign in, then shows your data", async () => {
    fakeApi.data = norm(structuredClone(backup));
    fakeApi.switchTo(null);
    const user = userEvent.setup();
    render(<App />);
    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    expect(screen.queryByText("Learn Git")).toBeNull();
    await fillAuth(user, ME.email, ME.password, "Sign in");
    await screen.findByRole("heading", { name: /Build a web app with Claude Code/ });
    expect(byId("accountEmail")).toHaveTextContent(ME.email);
  });

  it("shows the server's message when the password is wrong", async () => {
    fakeApi.switchTo(null);
    const user = userEvent.setup();
    render(<App />);
    await fillAuth(user, ME.email, "not the password", "Sign in");
    expect(await screen.findByRole("alert")).toHaveTextContent("Email or password is wrong.");
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
  });

  it("creates an account, which starts empty", async () => {
    fakeApi.data = norm(structuredClone(backup));
    fakeApi.switchTo(null);
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole("button", { name: "Create an account" }));
    expect(screen.getByLabelText("Password")).toHaveAttribute("autocomplete", "new-password");
    await fillAuth(user, "new@example.com", "a long new password", "Create account");
    expect(await screen.findByText("No learning track yet")).toBeInTheDocument();
    expect(byId("accountEmail")).toHaveTextContent("new@example.com");
  });

  it("signing out hides your data, and the next person sees only theirs", async () => {
    const user = await withBackup();
    await user.click(screen.getByRole("button", { name: "Sign out" }));
    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /Build a web app with Claude Code/ })).toBeNull();
    expect(db.counts()).toEqual({ tracks: 0, entries: 0 }); // the cache was cleared too

    await user.click(screen.getByRole("button", { name: "Create an account" }));
    await fillAuth(user, "other@example.com", "another long password", "Create account");
    expect(await screen.findByText("No learning track yet")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Sign out" }));
    await fillAuth(user, ME.email, ME.password, "Sign in");
    await screen.findByRole("heading", { name: /Build a web app with Claude Code/ });
    expect(byId("logCount")).toHaveTextContent("15 entries");
  });

  it("goes back to sign-in when the session ends while you're working", async () => {
    const user = await withBackup();
    await user.selectOptions(byId("addTopic"), "planning");
    await user.type(byId("addText"), "Typed after the session ended");
    fakeApi.switchTo(null); // the session expired on the server
    await user.click(screen.getByRole("button", { name: "Add to log" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/signed out.*wasn't saved/);
    expect(screen.getByRole("heading", { name: "Sign in" })).toBeInTheDocument();
  });

  it("moves old browser data into only the first account that signs in on this browser", async () => {
    localStorage.setItem(KEY, JSON.stringify(backup));
    const user = userEvent.setup();
    render(<App />);
    await toast("Moved your browser data into your account");
    expect(localStorage.getItem(MOVED_KEY)).not.toBeNull();

    await user.click(screen.getByRole("button", { name: "Sign out" }));
    await user.click(await screen.findByRole("button", { name: "Create an account" }));
    await fillAuth(user, "second@example.com", "another long password", "Create account");
    expect(await screen.findByText("No learning track yet")).toBeInTheDocument();
    expect(fakeApi.data.entries).toHaveLength(0);
  });
});
