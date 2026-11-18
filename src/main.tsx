import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./ui/App";
import "./ui/App.css";
import { watchStackTables } from "./ui/stackTables";

const root = document.getElementById("root");
if (!root) throw new Error("#root not found");
watchStackTables(root);
createRoot(root).render(
	<StrictMode>
		<App />
	</StrictMode>,
);
