export type ActionError = { code: string; message: string; fields?: Record<string, string> };
export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: ActionError };

export const ok = <T>(data: T): ActionResult<T> => ({ ok: true, data });
export const fail = (
  code: string,
  message: string,
  fields?: Record<string, string>,
): ActionResult<never> => ({
  ok: false,
  error: { code, message, fields },
});
