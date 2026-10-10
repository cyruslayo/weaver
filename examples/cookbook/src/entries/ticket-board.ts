import "../shared/style.css";
import { mountCookbookScreen } from "../shared/harness.js";
import { ticketBoardScreen } from "../screens/ticket-board.js";

const target = document.querySelector<HTMLElement>("#app");
if (target === null) throw new Error("Cookbook ticket board root was not found");
mountCookbookScreen(target, ticketBoardScreen);
