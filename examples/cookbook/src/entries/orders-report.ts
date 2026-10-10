import "../shared/style.css";
import { mountCookbookScreen } from "../shared/harness.js";
import { ordersReportScreen } from "../screens/orders-report.js";

const target = document.querySelector<HTMLElement>("#app");
if (target === null) throw new Error("Cookbook orders report root was not found");
mountCookbookScreen(target, ordersReportScreen);
