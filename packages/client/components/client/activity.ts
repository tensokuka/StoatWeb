/**
 * How long without input before a visible, focused device counts as idle
 */
export const IDLE_AFTER_MS = 5 * 60 * 1000;

/**
 * Input closer together than this doesn't restart the idle timer
 */
const INPUT_THROTTLE_MS = 10 * 1000;

export interface ActivityInputs {
  visible: boolean;
  focused: boolean;
}

/**
 * Tracks whether this device is in use: visible, focused, and used in the
 * last five minutes. The server holds back push notifications while any of
 * the user's devices is in use.
 */
export class ActivityTracker {
  #inputs: ActivityInputs;
  #lastInput: number;
  #active: boolean;
  #timer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    inputs: ActivityInputs,
    private onChange: (active: boolean) => void,
    private now: () => number = Date.now,
  ) {
    this.#inputs = inputs;
    this.#lastInput = now();
    this.#active = this.#compute();
    this.#schedule();
  }

  get active() {
    return this.#active;
  }

  /** Visibility or focus changed */
  update(inputs: Partial<ActivityInputs>) {
    this.#inputs = { ...this.#inputs, ...inputs };
    // Coming back to the app is input in itself
    if (inputs.visible || inputs.focused) this.#lastInput = this.now();
    this.#refresh();
  }

  /** The user pressed, typed, scrolled or moved the pointer */
  input() {
    const now = this.now();
    if (this.#active && now - this.#lastInput < INPUT_THROTTLE_MS) return;
    this.#lastInput = now;
    this.#refresh();
  }

  dispose() {
    clearTimeout(this.#timer);
  }

  #compute() {
    return (
      this.#inputs.visible &&
      this.#inputs.focused &&
      this.now() - this.#lastInput < IDLE_AFTER_MS
    );
  }

  #refresh() {
    const active = this.#compute();
    if (active !== this.#active) {
      this.#active = active;
      this.onChange(active);
    }
    this.#schedule();
  }

  #schedule() {
    clearTimeout(this.#timer);
    if (!this.#active) return;
    this.#timer = setTimeout(
      () => this.#refresh(),
      this.#lastInput + IDLE_AFTER_MS - this.now(),
    );
  }
}
