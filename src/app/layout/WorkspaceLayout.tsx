import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { useEffect, useMemo, useState } from "react";
import { CommandPalette } from "../widgets/CommandPalette";
import { ProblemIngestDialog } from "../widgets/ProblemIngestDialog";

export default function WorkspaceLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [ingestOpen, setIngestOpen] = useState(false);

  const metaKey = useMemo(() => (navigator.platform.toLowerCase().includes("mac") ? "meta" : "ctrl"), []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName.toLowerCase();
        const isEditable =
          tag === "input" ||
          tag === "textarea" ||
          (target as HTMLElement).isContentEditable ||
          target.getAttribute("role") === "textbox";
        if (isEditable) return;
      }
      const hotkey = metaKey === "meta" ? e.metaKey : e.ctrlKey;
      if (hotkey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCmdOpen(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [metaKey]);

  return (
    <div className="min-h-dvh bg-[#0B0F14]">
      <div className="flex">
        <Sidebar collapsed={collapsed} onToggle={setCollapsed} />

        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar onOpenCommand={() => setCmdOpen(true)} onOpenIngest={() => setIngestOpen(true)} />
          <main className="mx-auto w-full max-w-[1360px] flex-1 px-4 py-4">
            <Outlet />
          </main>
        </div>
      </div>

      <CommandPalette open={cmdOpen} onOpenChange={setCmdOpen} />
      <ProblemIngestDialog open={ingestOpen} onOpenChange={setIngestOpen} />
    </div>
  );
}
