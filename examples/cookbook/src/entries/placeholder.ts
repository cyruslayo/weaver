import "../shared/style.css";
import { mountCookbookScreen } from "../shared/harness.js";
import { placeholderScreen } from "../screens/placeholder.js";

const target = document.querySelector<HTMLElement>("#app");
if (target === null) throw new Error("Cookbook placeholder root was not found");
mountCookbookScreen(target, placeholderScreen);
