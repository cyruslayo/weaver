import "../shared/style.css";
import { mountCookbookScreen } from "../shared/harness.js";
import { dashboardScreen } from "../screens/dashboard.js";

const target = document.querySelector<HTMLElement>("#app");
if (target === null) throw new Error("Cookbook dashboard root was not found");
mountCookbookScreen(target, dashboardScreen);
