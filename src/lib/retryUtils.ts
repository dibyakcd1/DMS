/**
 * Utility for robust async operations with timeout and retries
 */

export interface RetryOptions {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  timeoutMs: number;
  onRetry?: (attempt: number, error: Error) => void;
  signal?: AbortSignal;
}

const DEFAULT_OPTIONS: RetryOptions = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 10000,
  timeoutMs: 30000,
};

export async function withRetry<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  options: Partial<RetryOptions> = {}
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let attempt = 0;

  const executeWithTimeout = async (signal: AbortSignal): Promise<T> => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), opts.timeoutMs);
    
    // Link local controller to parent signal if provided
    if (signal.aborted) {
      clearTimeout(timeoutId);
      throw new Error("Operation aborted");
    }

    const linkedAbortHandler = () => {
      controller.abort();
      signal.removeEventListener('abort', linkedAbortHandler);
    };
    signal.addEventListener('abort', linkedAbortHandler);

    try {
      const result = await operation(controller.signal);
      return result;
    } finally {
      clearTimeout(timeoutId);
      signal.removeEventListener('abort', linkedAbortHandler);
    }
  };

  while (true) {
    try {
      return await executeWithTimeout(opts.signal || new AbortController().signal);
    } catch (err: unknown) {
      attempt++;
      
      const error = err instanceof Error ? err : new Error(String(err));
      const isAbortError = error.name === 'AbortError' || error.message === 'Operation aborted';
      
      const status = (err as { status?: number })?.status;
      const isRateLimit = status === 429 || error.message.includes('rate limit');
      const isNetworkError = !status || status >= 500;
      
      // Don't retry aborts or non-retryable user errors
      if (isAbortError || (!isRateLimit && !isNetworkError && attempt > 1)) {
        throw error;
      }

      if (attempt > opts.maxRetries) {
        throw error;
      }

      const delay = Math.min(
        opts.initialDelayMs * Math.pow(2, attempt - 1) + Math.random() * 100,
        opts.maxDelayMs
      );

      opts.onRetry?.(attempt, error);
      
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}
