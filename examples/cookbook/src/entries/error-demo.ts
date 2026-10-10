import "../shared/style.css";
import "@weaver/shared/diagnostics-panel.css";
import { mountErrorDemo } from "../screens/error-demo.js";

const surface = document.querySelector<HTMLElement>("#surface");
const panel = document.querySelector<HTMLElement>("#diagnostics");
if (surface === null || panel === null) throw new Error("Cookbook error demo roots were not found");
mountErrorDemo(surface, panel);
