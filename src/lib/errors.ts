// Normalising thrown values into something worth showing a user.

/**
 * Pull a human-readable message out of an unknown thrown value.
 *
 * The WASM SDK throws `WasmSdkError`, which is not an `Error` instance and
 * whose only own property is a wasm pointer — `String(e)` yields
 * "[object Object]" and `JSON.stringify(e)` yields `{"__wbg_ptr":N}`. It does
 * expose a real `message` getter, so read that before falling back to coercion.
 */
export function describeError(e: unknown): string {
  if (typeof e === 'string') return e;
  if (e && typeof e === 'object') {
    const message = (e as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) return message;
  }
  const coerced = String(e);
  return coerced === '[object Object]' ? 'unknown error' : coerced;
}

/**
 * Address exhaustion is reported as "no available addresses to retry, last
 * error: <cause>". The wrapper only says every endpoint was tried — the cause
 * is the part that explains why, so unwrap it before classifying.
 */
export function rootCause(message: string): string {
  const m = /last error:\s*(.+)$/is.exec(message);
  return m ? m[1].trim() : message;
}

export type FailureKind =
  | 'unreachable' // nothing answered
  | 'unverifiable' // nodes answered, but their proofs did not check out
  | 'unknown';

/**
 * Note the ordering: exhausting the address list is a *consequence* of the
 * underlying failure, and its message quotes that failure verbatim, so a
 * verification problem would otherwise be misread as the network being down.
 */
export function classifyFailure(message: string): FailureKind {
  const cause = rootCause(message);
  if (/proof verification|quorum not found in cache|context provider error/i.test(cause)) {
    return 'unverifiable';
  }
  if (/no available addresses|no addresses available|no DAPI endpoint reachable/i.test(message)) {
    return 'unreachable';
  }
  return 'unknown';
}
