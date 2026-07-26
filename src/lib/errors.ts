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
 * DAPI exhausted its endpoint list without reaching an evonode, i.e. the
 * network itself looks down rather than the query being wrong. Both the
 * first-attempt and post-retry phrasings start the same way.
 */
export const isNetworkUnreachable = (message: string): boolean =>
  /no available addresses/i.test(message) || /no DAPI endpoint reachable/i.test(message);
