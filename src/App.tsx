import { AddEntryForm } from "./components/AddEntryForm";
import { Banner, Toast } from "./components/Banner";
import { GoalPanel } from "./components/GoalPanel";
import { LogPanel } from "./components/LogPanel";
import { MilestonePanel } from "./components/MilestonePanel";
import { NextPanel } from "./components/NextPanel";
import { QuestionsPanel } from "./components/QuestionsPanel";
import { TopBar } from "./components/TopBar";
import { TopicsPanel } from "./components/TopicsPanel";
import { AppProvider } from "./state/AppContext";

export function App() {
  return (
    <AppProvider>
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
