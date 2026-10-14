/**
 * The dinner app: the basket, the quantities and the placed order. Totals come from model.ts, so an
 * order is accepted only when its item count and total match the app's own basket.
 */
import { DISHES, type DishId } from "../data.js";
import { DINNER_SURFACE_ID, dinnerComponents, dinnerData, dinnerView, type DinnerState, type DinnerView } from "../agent/dinner.js";
import { foodItemCount, foodTotal, roundCents } from "../model.js";
import { accept, refuse, type ScenarioDefinition } from "./types.js";
import { hasExactKeys, isOneOf } from "./validate.js";

const DISH_IDS: readonly DishId[] = DISHES.map((dish) => dish.id);

export const dinnerDefinition: ScenarioDefinition<DinnerState, DinnerView> = {
  id: "food",
  surfaceId: DINNER_SURFACE_ID,
  mainAction: "place_order",
  initial: () => ({
    done: false,
    qty: { pizza: 2, pasta: 1, salmon: 1, salad: 1, cake: 0, nata: 2 },
  }),
  view: dinnerView,
  components: dinnerComponents,
  data: dinnerData,
  // The dinner screen has no inputs: quantities change through the buttons, which send actions.
  inputs: {},
  actions: {
    change_qty: (state, context) => {
      if (state.done) return refuse("the order is already placed");
      if (!hasExactKeys(context, ["dish", "delta"])) return refuse("change_qty takes a dish and a delta");
      const dish = context.dish;
      const delta = context.delta;
      if (!isOneOf(dish, DISH_IDS)) return refuse("unknown dish");
      if (delta !== 1 && delta !== -1) return refuse("delta must be 1 or -1");
      const next = Math.max(0, state.qty[dish] + delta);
      return accept({ ...state, qty: { ...state.qty, [dish]: next } });
    },
    place_order: (state, context) => {
      if (state.done) return refuse("the order is already placed");
      if (!hasExactKeys(context, ["items", "total"])) return refuse("place_order takes items and a total");
      const items = context.items;
      const total = context.total;
      const count = foodItemCount(state.qty);
      if (count === 0) return refuse("the basket is empty");
      if (typeof items !== "number" || items !== count) return refuse("the item count does not match the basket");
      if (typeof total !== "number" || roundCents(total) !== foodTotal(state.qty)) return refuse("the total does not match the basket");
      return accept({ ...state, done: true });
    },
    new_order: (state, context) => {
      if (!state.done) return refuse("no order is placed yet");
      if (!hasExactKeys(context, [])) return refuse("new_order takes no context");
      return accept({ ...state, done: false });
    },
  },
};
