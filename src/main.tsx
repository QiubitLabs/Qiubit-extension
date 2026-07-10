import "./utils/polyfills.js";
import { logInfo } from "./utils/logger";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import "./styles/animations.css";
import "./styles/Tabs.css";
import "./styles/Buttons.css";
import "./styles/Forms.css";
import "./styles/Modals.css";
import App from "./App";
import { ErrorBoundary } from "./components/shared/ErrorBoundary";

import { Buffer } from "buffer";

declare global {
  interface Window {
    Buffer: typeof Buffer;
    global: Window;
  }
}

window.Buffer = Buffer;

if (typeof global === "undefined") {
  window.global = window;
}

const root = document.getElementById("root");

if (!root) {
  console.error("[Main] Root element not found!");
} else {
  createRoot(root!).render(
    <StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </StrictMode>,
  );
  logInfo("[Main] Qiubit mounted successfully");
}
