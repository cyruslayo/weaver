import "./style.css";
import { createReferenceApplication } from "./reference-app.js";

const target = document.querySelector<HTMLElement>("#app");
if (target === null) throw new Error("Reference application root was not found");
createReferenceApplication(target);
