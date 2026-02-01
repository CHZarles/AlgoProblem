import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster } from "sonner";
import WorkspaceLayout from "./app/layout/WorkspaceLayout";
import ProblemsPage from "./pages/ProblemsPage";
import ProblemDetailPage from "./pages/ProblemDetailPage";
import NotesPage from "./pages/NotesPage";
import SolutionsPage from "./pages/SolutionsPage";
import CollectionsPage from "./pages/CollectionsPage";
import CollectionDetailPage from "./pages/CollectionDetailPage";
import StatsPage from "./pages/StatsPage";
import ReviewPage from "./pages/ReviewPage";
import SettingsPage from "./pages/SettingsPage";
import { ThemeProvider, useTheme } from "./app/theme";
import { DensityProvider } from "./app/density";

function AppShell() {
  const theme = useTheme();
  const toasterTheme = theme.resolved === "light" ? "light" : "dark";
  const toasterClassName =
    theme.resolved === "light"
      ? theme.preference === "autumn"
        ? "bg-[#FFFAF4] text-slate-800 shadow-[0_0_0_1px_rgba(61,39,23,0.16)] shadow-panel"
        : "bg-white text-slate-800 shadow-[0_0_0_1px_rgba(15,23,42,0.12)] shadow-panel"
      : "bg-[#0F1520] text-slate-200 shadow-[0_0_0_1px_rgba(148,163,184,0.14)] shadow-panel";
  return (
    <>
      <Toaster
        theme={toasterTheme}
        position="top-right"
        toastOptions={{
          className: toasterClassName,
        }}
      />
      <Routes>
        <Route element={<WorkspaceLayout />}>
          <Route index element={<Navigate to="/problems" replace />} />
          <Route path="/problems" element={<ProblemsPage />} />
          <Route path="/problems/:problemId" element={<ProblemDetailPage />} />
          <Route path="/notes" element={<NotesPage />} />
          <Route path="/solutions" element={<SolutionsPage />} />
          <Route path="/collections" element={<CollectionsPage />} />
          <Route path="/collections/:collectionId" element={<CollectionDetailPage />} />
          <Route path="/review" element={<ReviewPage />} />
          <Route path="/stats" element={<StatsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/problems" replace />} />
        </Route>
      </Routes>
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <DensityProvider>
          <AppShell />
        </DensityProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}
