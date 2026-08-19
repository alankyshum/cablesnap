export type ToolFailure = {
  readonly ok: false;
  readonly error: {
    readonly kind: "local_data_unavailable";
    readonly message: "Local fitness data could not be read.";
  };
};

export type ToolSuccess<T> = { readonly ok: true; readonly data: T };
export type ToolResult<T> = ToolSuccess<T> | ToolFailure;

export async function recoverLocal<T>(read: () => Promise<T>): Promise<ToolResult<T>> {
  try {
    return { ok: true, data: await read() };
  } catch {
    return {
      ok: false,
      error: { kind: "local_data_unavailable", message: "Local fitness data could not be read." },
    };
  }
}

export function boundedLimit(value: number, fallback: number, maximum: number): number {
  return Math.min(Math.max(Math.trunc(value || fallback), 1), maximum);
}
