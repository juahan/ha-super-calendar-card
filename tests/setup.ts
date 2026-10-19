/** Vitest setup: environment shims shared by all tests. */
import { vi } from "vitest";

// happy-dom lacks ResizeObserver; the card guards but components may observe.
if (typeof (globalThis as any).ResizeObserver === "undefined") {
  (globalThis as any).ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };
}

// Deterministic random for generateSourceId tests where needed.
export function stubRandomSequence(values: string[]): void {
  let i = 0;
  vi.spyOn(Math, "random").mockImplementation(() => {
    const value = values[i % values.length]!;
    i += 1;
    return parseInt(value, 16) / 0xffff;
  });
}
