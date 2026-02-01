import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "highlight.js/styles/github-dark.css";
import "katex/dist/katex.min.css";
import "./index.css";
import App from "./App.tsx";
import { applyStoredTheme } from "./app/theme";

applyStoredTheme();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
