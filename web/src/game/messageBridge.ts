// The interpreter's door to the message system (ui/messages), kept as a
// small interface so the two sides can be built independently.

export interface ChooseNumberParams {
  maxDigits: number;
  defaultValue: number;
}

export interface MessageApi {
  /**
   * pbMessage(text, commands, cmdIfCancel) with Essentials' convention:
   * cmdIfCancel 0 = can't cancel, n > 0 = cancelling returns n - 1, n < 0 = returns n.
   */
  pbMessage(text: string, commands?: string[] | null, cmdIfCancel?: number, defaultCmd?: number): Promise<number>;
  /** pbShowCommands(nil, commands, cmdIfCancel). */
  pbShowCommands(commands: string[], cmdIfCancel?: number, defaultCmd?: number): Promise<number>;
  /** pbMessageChooseNumber / pbChooseNumber. */
  pbMessageChooseNumber(text: string | null, params: ChooseNumberParams): Promise<number>;
}

let api: MessageApi = {
  async pbMessage(text) {
    console.info("[message]", text);
    return -1;
  },
  async pbShowCommands() {
    return 0;
  },
  async pbMessageChooseNumber(_text, params) {
    return params.defaultValue;
  },
};

export function setMessageApi(impl: MessageApi): void {
  api = impl;
}

export function messages(): MessageApi {
  return api;
}
