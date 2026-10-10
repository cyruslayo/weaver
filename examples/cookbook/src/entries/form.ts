import "../shared/style.css";
import { mountCookbookScreen } from "../shared/harness.js";
import { formScreen } from "../screens/form/screen.js";

const target = document.querySelector<HTMLElement>("#app");
if (target === null) throw new Error("Cookbook form root was not found");
mountCookbookScreen(target, formScreen);
