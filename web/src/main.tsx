import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles/glow.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <div className="flex items-center justify-center min-h-screen">
      <h1 className="text-2xl text-purple-400">Memoark</h1>
    </div>
  </StrictMode>,
);
