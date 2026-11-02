/** Internal cooperative runner. Never yields through a microtask-only promise. */
export async function runInChunks<T>(
  steps: Generator<void, T, void>,
  signal: AbortSignal,
  options: {
    budgetMs?: number;
    now?: () => number;
    yieldToHost?: () => Promise<void>;
  } = {},
): Promise<T> {
  const budget = options.budgetMs ?? 8;
  if (!Number.isFinite(budget) || budget <= 0)
    throw new Error('Chunk budget must be positive and finite.');
  const now = options.now ?? (() => performance.now());
  // A timer task works across supported browsers without worker/bundler setup.
  const yieldToHost =
    options.yieldToHost ??
    (() => new Promise<void>((resolve) => setTimeout(resolve, 0)));
  const check = () => {
    if (signal.aborted)
      throw signal.reason ?? new DOMException('Layout cancelled', 'AbortError');
  };
  try {
    check();
    // Let the surrounding page commit before the first unit of layout work.
    await yieldToHost();
    while (true) {
      check();
      const deadline = now() + budget;
      do {
        check();
        const next = steps.next();
        if (next.done) return next.value;
      } while (now() < deadline);
      await yieldToHost();
    }
  } finally {
    // Release the abandoned iterator and its route caches on cancellation.
    steps.return(undefined as never);
  }
}
