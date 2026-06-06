/**
 * Polyfills for web APIs missing in the React Native (Hermes) runtime.
 * Imported at the very top of index.ts so they run before any app/SDK code.
 */

// AbortSignal.any — used by the Firebase JS SDK (firebase/ai) for request
// cancellation, but absent in Hermes. Returns a signal that aborts as soon as
// any of the input signals aborts.
if (
  typeof AbortSignal !== 'undefined' &&
  typeof (AbortSignal as unknown as { any?: unknown }).any !== 'function'
) {
  (AbortSignal as unknown as { any: (signals: AbortSignal[]) => AbortSignal }).any = (
    signals: AbortSignal[]
  ): AbortSignal => {
    const controller = new AbortController();
    const onAbort = (signal: AbortSignal) => {
      if (controller.signal.aborted) return;
      controller.abort((signal as unknown as { reason?: unknown }).reason);
    };
    for (const signal of signals) {
      if (signal.aborted) {
        onAbort(signal);
        break;
      }
      signal.addEventListener('abort', () => onAbort(signal), { once: true });
    }
    return controller.signal;
  };
}

// AbortSignal.timeout — same story; add defensively since the SDK may use it too.
if (
  typeof AbortSignal !== 'undefined' &&
  typeof (AbortSignal as unknown as { timeout?: unknown }).timeout !== 'function'
) {
  (AbortSignal as unknown as { timeout: (ms: number) => AbortSignal }).timeout = (
    ms: number
  ): AbortSignal => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(new Error('TimeoutError')), ms);
    return controller.signal;
  };
}
