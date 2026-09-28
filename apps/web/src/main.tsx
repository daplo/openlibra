import { SharedEditor } from "./components/SharedEditor";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { CollaborationPrototype } from "./components/CollaborationPrototype";
import { App } from "./App";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {new URLSearchParams(location.search).has("shared") ? (
      <SharedEditor />
    ) : new URLSearchParams(location.search).has("collaboration") ? (
      <CollaborationPrototype />
    ) : (
      <App />
    )}
  </StrictMode>,
);
