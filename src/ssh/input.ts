export const Keys = {
  enter: "\r",
  lineFeed: "\n",
  ctrlC: "\x03",
  ctrlD: "\x04",
  ctrlV: "\x16",
  tab: "\t",
  escape: "\x1b",
  backspace: "\x7f",
  arrowUp: "\x1b[A",
  arrowDown: "\x1b[B",
  arrowRight: "\x1b[C",
  arrowLeft: "\x1b[D"
} as const;

export type KeyName = keyof typeof Keys;

export type InputAction =
  | {
      type: "raw";
      data: string;
    }
  | {
      type: "text";
      text: string;
    }
  | {
      type: "line";
      text?: string;
    }
  | {
      type: "key";
      key: KeyName;
    }
  | {
      type: "paste";
      text: string;
      bracketed?: boolean;
    }
  | {
      type: "resize";
      cols: number;
      rows: number;
    };

export function bracketedPaste(text: string): string {
  return `\x1b[200~${text}\x1b[201~`;
}

export function encodeInputAction(action: Exclude<InputAction, { type: "resize" }>): string {
  switch (action.type) {
    case "raw":
      return action.data;
    case "text":
      return action.text;
    case "line":
      return `${action.text ?? ""}${Keys.enter}`;
    case "key":
      return Keys[action.key];
    case "paste":
      return action.bracketed === false ? action.text : bracketedPaste(action.text);
  }
}
