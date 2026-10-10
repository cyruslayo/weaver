import type { A2UIComponent, JsonObject, JsonValue } from "@cylayo/weaver-core";
import type { CookbookScreenDefinition } from "../shared/harness.js";

export const TICKET_BOARD_SURFACE_ID = "cookbook-ticket-board";
export const TICKET_MOVE = "ticket.move";
export const TICKET_ASSIGN = "ticket.assign";
export const TICKET_CLOSE = "ticket.close";
/** Required by the catalog on the Modal trigger. Never allowlisted, so it never reaches the agent. */
export const TICKET_OPEN_ASSIGN = "ticket.openAssign";

export const TICKET_STATUSES = ["open", "inProgress", "done"] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export interface Ticket {
  id: string;
  title: string;
  /** The person's label, shown on the card. The Assign picker sends the person's value. */
  assignee: string;
}

export type Person = {
  label: string;
  value: string;
};

export interface TicketBoardState {
  /**
   * Positional collections: `board/<status>[i]` is the item at index `i`. Moving
   * an item re-indexes the scopes after it. Weaver does not claim stable item identity.
   */
  board: Record<TicketStatus, Ticket[]>;
  /**
   * Written by the ChoicePicker through the local input binding, so the core
   * data model holds the live selection. The agent resets it after each assign.
   */
  draft: { assignee: string[] };
}

const COLUMN_TITLE: Record<TicketStatus, string> = {
  open: "Open",
  inProgress: "In progress",
  done: "Done",
};

/** The only moves the cards offer. `done` is reached through `ticket.close` only. */
const MOVE_TARGET: Partial<Record<TicketStatus, { to: TicketStatus; label: string }>> = {
  open: { to: "inProgress", label: "Start" },
  inProgress: { to: "open", label: "Back to open" },
  done: { to: "inProgress", label: "Reopen" },
};

const PEOPLE: Person[] = [
  { label: "Ada Lovelace", value: "ada" },
  { label: "Grace Hopper", value: "grace" },
  { label: "Linus Torvalds", value: "linus" },
];

export const TICKET_BOARD_INITIAL_STATE: TicketBoardState = {
  board: {
    open: [
      { id: "t-1", title: "Fix login redirect", assignee: "Unassigned" },
      { id: "t-2", title: "Document the cookbook", assignee: "Unassigned" },
    ],
    inProgress: [{ id: "t-3", title: "Add keyboard focus ring", assignee: "Unassigned" }],
    done: [],
  },
  draft: { assignee: [] },
};

function isStatus(value: unknown): value is TicketStatus {
  return typeof value === "string" && (TICKET_STATUSES as readonly string[]).includes(value);
}

/** Finds a ticket by id across all columns. Ids are unique across the board. */
function locate(
  state: TicketBoardState,
  ticketId: unknown,
): { status: TicketStatus; index: number; ticket: Ticket } | undefined {
  if (typeof ticketId !== "string") return undefined;
  for (const status of TICKET_STATUSES) {
    const index = state.board[status].findIndex((ticket) => ticket.id === ticketId);
    if (index >= 0) return { status, index, ticket: state.board[status][index]! };
  }
  return undefined;
}

/**
 * One ticket card for a column. Ids are prefixed by the column, so each column's
 * template has its own components. Relative paths such as `title` and `id` resolve
 * inside the template scope of the item.
 */
function cardComponents(status: TicketStatus): A2UIComponent[] {
  const id = (suffix: string): string => `${status}-${suffix}`;
  const move = MOVE_TARGET[status]!;
  const hasClose = status !== "done";
  const components: A2UIComponent[] = [
    { id: id("card"), component: "Card", child: id("body") },
    {
      id: id("body"),
      component: "Column",
      children: [
        id("title"),
        id("assignee"),
        id("move"),
        ...(hasClose ? [id("close")] : []),
        id("assign"),
      ],
    },
    { id: id("title"), component: "Text", variant: "h3", text: { path: "title" } },
    { id: id("assignee"), component: "Text", text: { path: "assignee" } },
    {
      id: id("move"),
      component: "Button",
      child: id("move-label"),
      action: {
        event: {
          name: TICKET_MOVE,
          context: { ticketId: { path: "id" }, from: status, to: move.to },
        },
      },
    },
    { id: id("move-label"), component: "Text", text: move.label },
  ];

  if (hasClose)
    components.push(
      {
        id: id("close"),
        component: "Button",
        child: id("close-label"),
        action: { event: { name: TICKET_CLOSE, context: { ticketId: { path: "id" } } } },
      },
      { id: id("close-label"), component: "Text", text: "Close" },
    );

  components.push(
    { id: id("assign"), component: "Modal", trigger: id("assign-trigger"), content: id("assign-content") },
    {
      id: id("assign-trigger"),
      component: "Button",
      child: id("assign-trigger-label"),
      // The Basic Modal intercepts this click and opens locally. The action is required by the catalog
      // and is deliberately not allowlisted, so it could never reach the agent.
      action: { event: { name: TICKET_OPEN_ASSIGN, context: { ticketId: { path: "id" } } } },
    },
    { id: id("assign-trigger-label"), component: "Text", text: "Assign" },
    {
      id: id("assign-content"),
      component: "Column",
      children: [id("assign-picker"), id("assign-confirm")],
    },
    {
      id: id("assign-picker"),
      component: "ChoicePicker",
      label: "Assignee",
      // The catalog requires static options, so the list is the same constant the transition validates against.
      options: PEOPLE,
      value: { path: "/draft/assignee" },
    },
    {
      id: id("assign-confirm"),
      component: "Button",
      variant: "primary",
      child: id("assign-confirm-label"),
      action: {
        event: {
          name: TICKET_ASSIGN,
          context: { ticketId: { path: "id" }, assignee: { path: "/draft/assignee" } },
        },
      },
    },
    { id: id("assign-confirm-label"), component: "Text", text: "Assign ticket" },
  );
  return components;
}

function ticketBoardComponents(): A2UIComponent[] {
  const columns = TICKET_STATUSES.map((status) => ({
    id: `col-${status}`,
    component: "Column",
    children: [`${status}-heading`, `${status}-list`],
  }));
  const headings = TICKET_STATUSES.map((status) => ({
    id: `${status}-heading`,
    component: "Text",
    variant: "h2",
    text: COLUMN_TITLE[status],
  }));
  const lists = TICKET_STATUSES.map((status) => ({
    id: `${status}-list`,
    component: "List",
    children: { path: `/board/${status}`, componentId: `${status}-card` },
  }));
  return [
    { id: "root", component: "Column", children: ["heading", "board"] },
    { id: "heading", component: "Text", variant: "h1", text: "Ticket board" },
    { id: "board", component: "Row", children: columns.map((column) => column.id) },
    ...columns,
    ...headings,
    ...lists,
    ...TICKET_STATUSES.flatMap(cardComponents),
  ] as A2UIComponent[];
}

function boardPath(status: TicketStatus): string {
  return `/board/${status}`;
}

/** The value of one column, which is JSON-shaped: strings in plain objects and arrays. */
function columnValue(state: TicketBoardState, status: TicketStatus): JsonValue {
  // SAFETY: tickets are plain objects of string fields, so they are JSON-shaped.
  return state.board[status] as unknown as JsonValue;
}

/** Deterministic board: every transition validates its trusted context before it changes state. */
export const ticketBoardScreen: CookbookScreenDefinition<TicketBoardState> = {
  surfaceId: TICKET_BOARD_SURFACE_ID,
  attributionName: "Board Agent",
  initialState: TICKET_BOARD_INITIAL_STATE,
  components: ticketBoardComponents,
  actions: {
    [TICKET_MOVE]: {
      transition: (state, context) => {
        const { ticketId, from, to } = context as JsonObject;
        if (!isStatus(from) || !isStatus(to) || from === to) return undefined;
        const allowed = MOVE_TARGET[from];
        if (allowed === undefined || allowed.to !== to) return undefined;
        const found = locate(state, ticketId);
        if (found === undefined || found.status !== from) return undefined;
        state.board[from].splice(found.index, 1);
        state.board[to].push(found.ticket);
        return state;
      },
      dataUpdates: (_previous, next, context) => {
        const { from, to } = context as JsonObject;
        const source = from as TicketStatus;
        const target = to as TicketStatus;
        return [
          { path: boardPath(source), value: columnValue(next, source) },
          { path: boardPath(target), value: columnValue(next, target) },
        ];
      },
    },
    [TICKET_CLOSE]: {
      transition: (state, context) => {
        const found = locate(state, context.ticketId);
        if (found === undefined || found.status === "done") return undefined;
        state.board[found.status].splice(found.index, 1);
        state.board.done.push(found.ticket);
        return state;
      },
      dataUpdates: (previous, next, context) => {
        const found = locate(previous, context.ticketId);
        const source = found?.status ?? "open";
        return [
          { path: boardPath(source), value: columnValue(next, source) },
          { path: boardPath("done"), value: columnValue(next, "done") },
        ];
      },
    },
    [TICKET_ASSIGN]: {
      transition: (state, context) => {
        const { ticketId, assignee } = context as JsonObject;
        const found = locate(state, ticketId);
        if (found === undefined) return undefined;
        if (!Array.isArray(assignee) || assignee.length !== 1) return undefined;
        const value = assignee[0];
        const person = PEOPLE.find((candidate) => candidate.value === value);
        if (person === undefined) return undefined;
        state.board[found.status][found.index] = { ...found.ticket, assignee: person.label };
        state.draft = { assignee: [] };
        return state;
      },
      dataUpdates: (previous, next, context) => {
        const found = locate(previous, context.ticketId);
        const source = found?.status ?? "open";
        return [
          { path: boardPath(source), value: columnValue(next, source) },
          // The ChoicePicker wrote the selection into the core data model. Reset it explicitly.
          { path: "/draft/assignee", value: [] },
        ];
      },
    },
  },
};
