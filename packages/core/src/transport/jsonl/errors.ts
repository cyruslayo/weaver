export type JsonlDecodeError =
  | { code: "INVALID_JSON"; frame: number }
  | { code: "FRAME_TOO_LARGE"; frame: number; maxFrameCharacters: number };
