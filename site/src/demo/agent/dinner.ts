/**
 * The dinner agent: a deterministic stand-in for a model. It describes the menu, the basket and
 * the placed-order screen with Basic catalog components, from the app state it is given.
 */
import type { A2UIComponent, JsonObject } from "@cylayo/weaver-core";
import { DISHES, FOOD_DELIVERY_FEE, type ImageKey } from "../data.js";
import { imageSource } from "../images.js";
import { basketLines, foodItemCount, foodTotal, formatEur, roundCents, type DishQuantities } from "../model.js";
import { bind, heading } from "../a2ui.js";

export const DINNER_SURFACE_ID = "order";

export type DinnerView = "menu" | "done";

export interface DinnerState {
  /** True once the order is placed. */
  done: boolean;
  qty: DishQuantities;
}

export function dinnerView(state: DinnerState): DinnerView {
  return state.done ? "done" : "menu";
}

/** The data every view reads. The host sends it after each change. */
export function dinnerData(state: DinnerState): JsonObject {
  const lines = basketLines(state.qty);
  const items = foodItemCount(state.qty);
  const total = formatEur(foodTotal(state.qty));
  return {
    menu: DISHES.map((dish) => ({
      id: dish.id,
      name: dish.name,
      title: heading(3, dish.name),
      price: formatEur(dish.price),
      img: imageSource(dish.id),
      alt: dish.alt,
      qtyLabel: String(state.qty[dish.id]),
    })),
    basket: {
      lines: lines.map((line) => ({ label: `${line.qty} × ${line.name}`, amount: formatEur(line.amount) })),
      empty: items === 0 ? "Add dishes to start an order." : "",
      total,
      totalTitle: heading(3, total),
      items,
      totalValue: roundCents(foodTotal(state.qty)),
      placeLabel: `Place order · ${total}`,
    },
    done: {
      summary: `${items} items · ${total} · arrives in about 40 minutes`,
      photos: lines.map((line) => {
        const dish = DISHES.find((candidate) => candidate.id === line.id);
        return { url: imageSource(line.id as ImageKey), alt: dish?.alt ?? line.name };
      }),
    },
  };
}

export function dinnerComponents(view: DinnerView): A2UIComponent[] {
  return view === "menu" ? menuComponents() : doneComponents();
}

function dishCardComponents(): A2UIComponent[] {
  return [
    { id: "dish_card", component: "Card", child: "dish_body" },
    { id: "dish_body", component: "Column", children: ["dish_photo", "dish_name", "dish_price", "dish_stepper"] },
    {
      id: "dish_photo",
      component: "Image",
      url: bind("img"),
      description: bind("alt"),
      fit: "cover",
      variant: "largeFeature",
    },
    { id: "dish_name", component: "Text", text: bind("title") },
    { id: "dish_price", component: "Text", variant: "caption", text: bind("price") },
    { id: "dish_stepper", component: "Row", justify: "spaceBetween", children: ["dish_minus", "dish_qty", "dish_plus"] },
    {
      id: "dish_minus",
      component: "Button",
      child: "dish_minus_label",
      action: { event: { name: "change_qty", context: { dish: bind("id"), delta: -1 } } },
    },
    { id: "dish_minus_label", component: "Text", text: "−" },
    { id: "dish_qty", component: "Text", text: bind("qtyLabel") },
    {
      id: "dish_plus",
      component: "Button",
      child: "dish_plus_label",
      action: { event: { name: "change_qty", context: { dish: bind("id"), delta: 1 } } },
    },
    { id: "dish_plus_label", component: "Text", text: "+" },
  ];
}

function menuComponents(): A2UIComponent[] {
  return [
    { id: "root", component: "Column", children: ["menu_title", "menu_sub", "layout"] },
    { id: "menu_title", component: "Text", text: heading(2, "Dinner for four from Tasca Nova") },
    { id: "menu_sub", component: "Text", variant: "caption", text: "Delivers in about 40 minutes · sample menu and prices" },
    { id: "layout", component: "Row", children: ["menu", "basket"] },
    { id: "menu", component: "List", children: { componentId: "dish_card", path: "/menu" } },
    ...dishCardComponents(),
    { id: "basket", component: "Card", child: "basket_body" },
    {
      id: "basket_body",
      component: "Column",
      children: ["basket_title", "basket_empty", "basket_lines", "basket_delivery", "basket_total", "place"],
    },
    { id: "basket_title", component: "Text", text: heading(3, "Your order") },
    { id: "basket_empty", component: "Text", variant: "caption", text: bind("/basket/empty") },
    { id: "basket_lines", component: "List", children: { componentId: "basket_line", path: "/basket/lines" } },
    { id: "basket_line", component: "Row", justify: "spaceBetween", children: ["basket_line_label", "basket_line_amount"] },
    { id: "basket_line_label", component: "Text", text: bind("label") },
    { id: "basket_line_amount", component: "Text", text: bind("amount") },
    { id: "basket_delivery", component: "Row", justify: "spaceBetween", children: ["basket_delivery_label", "basket_delivery_amount"] },
    { id: "basket_delivery_label", component: "Text", variant: "caption", text: "Delivery" },
    { id: "basket_delivery_amount", component: "Text", text: formatEur(FOOD_DELIVERY_FEE) },
    { id: "basket_total", component: "Row", justify: "spaceBetween", children: ["basket_total_label", "basket_total_amount"] },
    { id: "basket_total_label", component: "Text", text: heading(3, "Total") },
    { id: "basket_total_amount", component: "Text", text: bind("/basket/totalTitle") },
    {
      id: "place",
      component: "Button",
      variant: "primary",
      child: "place_label",
      action: {
        event: {
          name: "place_order",
          context: { items: bind("/basket/items"), total: bind("/basket/totalValue") },
        },
      },
    },
    { id: "place_label", component: "Text", text: bind("/basket/placeLabel") },
  ];
}

function doneComponents(): A2UIComponent[] {
  return [
    { id: "root", component: "Column", children: ["done_title", "done_summary", "done_photos", "done_again"] },
    { id: "done_title", component: "Text", text: heading(2, "Order placed") },
    { id: "done_summary", component: "Text", variant: "caption", text: bind("/done/summary") },
    { id: "done_photos", component: "List", direction: "horizontal", children: { componentId: "done_photo", path: "/done/photos" } },
    {
      id: "done_photo",
      component: "Image",
      url: bind("url"),
      description: bind("alt"),
      fit: "cover",
      variant: "smallFeature",
    },
    {
      id: "done_again",
      component: "Button",
      child: "done_again_label",
      action: { event: { name: "new_order", context: {} } },
    },
    { id: "done_again_label", component: "Text", text: "Start a new order" },
  ];
}
