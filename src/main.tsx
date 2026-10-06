import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "@fontsource/titillium-web/latin-400.css";
import "@fontsource/titillium-web/latin-600.css";
import "@fontsource/titillium-web/latin-700.css";
import "@fontsource/titillium-web/latin-700-italic.css";
import "@fontsource/titillium-web/latin-900.css";
import "@fontsource/jetbrains-mono/latin-400.css";
import "@fontsource/jetbrains-mono/latin-600.css";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);
