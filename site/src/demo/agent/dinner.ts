/**
 * The dinner agent: a deterministic stand-in for a model. It describes the menu, the basket and
 * the placed-order screen with Basic catalog components, from the app state it is given.
 */
import type { A2UIComponent, JsonObject } from "@cylayo/weaver-core";
import { DISHES, FOOD_DELIVERY_FEE, type ImageKey } from "../data.js";
import { imageSource } from "../images.js";
import { basketLines, foodItemCount, foodTotal, formatEur, roundCents, type DishQuantities } from "../model.js";

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
      price: formatEur(dish.price),
      img: imageSource(dish.id),
      alt: dish.alt,
      qtyLabel: String(state.qty[dish.id]),
    })),
    basket: {
      lines: lines.map((line) => ({ label: `${line.qty} × ${line.name}`, amount: formatEur(line.amount) })),
      empty: items === 0 ? "Add dishes to start an order." : "",
      total,
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
    { id: "dish-card", component: "Card", child: "dish-body" },
    { id: "dish-body", component: "Column", children: ["dish-photo", "dish-name", "dish-price", "dish-stepper"] },
    {
      id: "dish-photo",
      component: "Image",
      url: { path: "img" },
      description: { path: "alt" },
      fit: "cover",
      variant: "largeFeature",
    },
    { id: "dish-name", component: "Text", variant: "h3", text: { path: "name" } },
    { id: "dish-price", component: "Text", variant: "caption", text: { path: "price" } },
    { id: "dish-stepper", component: "Row", justify: "spaceBetween", children: ["dish-minus", "dish-qty", "dish-plus"] },
    {
      id: "dish-minus",
      component: "Button",
      child: "dish-minus-label",
      action: { event: { name: "change_qty", context: { dish: { path: "id" }, delta: -1 } } },
    },
    { id: "dish-minus-label", component: "Text", text: "−" },
    { id: "dish-qty", component: "Text", text: { path: "qtyLabel" } },
    {
      id: "dish-plus",
      component: "Button",
      child: "dish-plus-label",
      action: { event: { name: "change_qty", context: { dish: { path: "id" }, delta: 1 } } },
    },
    { id: "dish-plus-label", component: "Text", text: "+" },
  ];
}

function menuComponents(): A2UIComponent[] {
  return [
    { id: "root", component: "Column", children: ["menu-title", "menu-sub", "layout"] },
    { id: "menu-title", component: "Text", variant: "h2", text: "Dinner for four from Tasca Nova" },
    { id: "menu-sub", component: "Text", variant: "caption", text: "Delivers in about 40 minutes · sample menu and prices" },
    { id: "layout", component: "Row", children: ["menu", "basket"] },
    { id: "menu", component: "List", children: { path: "/menu", componentId: "dish-card" } },
    ...dishCardComponents(),
    { id: "basket", component: "Card", child: "basket-body" },
    {
      id: "basket-body",
      component: "Column",
      children: ["basket-title", "basket-empty", "basket-lines", "basket-delivery", "basket-total", "place"],
    },
    { id: "basket-title", component: "Text", variant: "h3", text: "Your order" },
    { id: "basket-empty", component: "Text", variant: "caption", text: { path: "/basket/empty" } },
    { id: "basket-lines", component: "List", children: { path: "/basket/lines", componentId: "basket-line" } },
    { id: "basket-line", component: "Row", justify: "spaceBetween", children: ["basket-line-label", "basket-line-amount"] },
    { id: "basket-line-label", component: "Text", text: { path: "label" } },
    { id: "basket-line-amount", component: "Text", text: { path: "amount" } },
    { id: "basket-delivery", component: "Row", justify: "spaceBetween", children: ["basket-delivery-label", "basket-delivery-amount"] },
    { id: "basket-delivery-label", component: "Text", variant: "caption", text: "Delivery" },
    { id: "basket-delivery-amount", component: "Text", text: formatEur(FOOD_DELIVERY_FEE) },
    { id: "basket-total", component: "Row", justify: "spaceBetween", children: ["basket-total-label", "basket-total-amount"] },
    { id: "basket-total-label", component: "Text", variant: "h3", text: "Total" },
    { id: "basket-total-amount", component: "Text", variant: "h3", text: { path: "/basket/total" } },
    {
      id: "place",
      component: "Button",
      variant: "primary",
      child: "place-label",
      action: {
        event: {
          name: "place_order",
          context: { items: { path: "/basket/items" }, total: { path: "/basket/totalValue" } },
        },
      },
    },
    { id: "place-label", component: "Text", text: { path: "/basket/placeLabel" } },
  ];
}

function doneComponents(): A2UIComponent[] {
  return [
    { id: "root", component: "Column", children: ["done-title", "done-summary", "done-photos", "done-again"] },
    { id: "done-title", component: "Text", variant: "h2", text: "Order placed" },
    { id: "done-summary", component: "Text", variant: "caption", text: { path: "/done/summary" } },
    { id: "done-photos", component: "List", direction: "horizontal", children: { path: "/done/photos", componentId: "done-photo" } },
    {
      id: "done-photo",
      component: "Image",
      url: { path: "url" },
      description: { path: "alt" },
      fit: "cover",
      variant: "smallFeature",
    },
    {
      id: "done-again",
      component: "Button",
      child: "done-again-label",
      action: { event: { name: "new_order", context: {} } },
    },
    { id: "done-again-label", component: "Text", text: "Start a new order" },
  ];
}
