// Pauses interval callbacks while the browser tab is hidden.
//
// Every setInterval in the app is a data-refresh poller. Background tabs were
// continuing to fire those polls (and their database queries) even though
// nobody could see the results. Wrapping window.setInterval once here pauses
// them all without touching every component; the timer keeps ticking but its
// callback is skipped while document.hidden, so the next visible tick refreshes
// the data. setTimeout is deliberately left alone (one-off/debounce behaviour).

export function installVisibilityAwareTimers(): void {
  if (typeof window === 'undefined') return;
  const w = window as any;
  if (w.__sretanVisibilityTimersInstalled) return;
  w.__sretanVisibilityTimersInstalled = true;

  const nativeSetInterval = window.setInterval.bind(window);

  window.setInterval = ((handler: TimerHandler, timeout?: number, ...args: any[]) => {
    if (typeof handler !== 'function') {
      return nativeSetInterval(handler, timeout, ...args);
    }
    const wrapped = (...a: any[]) => {
      if (document.hidden) return;
      (handler as (...x: any[]) => void)(...a);
    };
    return nativeSetInterval(wrapped, timeout, ...args);
  }) as typeof window.setInterval;
}
