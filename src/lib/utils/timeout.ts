/**
 * Timeout utility for EVE Secure
 * Wraps any promise with a hard deadline.
 *
 * Recommended timeouts:
 *   LLM calls:           30 000 ms
 *   Embedding generation: 10 000 ms
 *   Vector search:        15 000 ms
 *   Auth checks:           5 000 ms
 */

export class TimeoutError extends Error {
  public readonly label: string;
  public readonly ms: number;

  constructor(label: string, ms: number) {
    super(`Timeout: "${label}" exceeded ${ms}ms`);
    this.name = "TimeoutError";
    this.label = label;
    this.ms = ms;
  }
}

/**
 * Race a promise against a timeout.
 * @param promise  The async operation to wrap.
 * @param ms       Maximum duration in milliseconds.
 * @param label    Human-readable label for error messages.
 * @throws {TimeoutError} if the deadline is exceeded.
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new TimeoutError(label, ms)), ms);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
