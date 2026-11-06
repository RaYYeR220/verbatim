import { z } from "zod";

/** Accepts an array, or a JSON string of one (CLI and HTTP form callers). */
export function jsonArray<T extends z.ZodTypeAny>(item: T, opts: { min?: number; max: number }) {
  let arr = z.array(item).max(opts.max);
  if (opts.min !== undefined) arr = arr.min(opts.min);
  return z.preprocess((v) => {
    if (typeof v !== "string") return v;
    try {
      return JSON.parse(v);
    } catch {
      return v;
    }
  }, arr);
}

/** Accepts an object, or a JSON string of one (CLI and HTTP form callers). */
export function jsonObject<T extends z.ZodTypeAny>(shape: T) {
  return z.preprocess((v) => {
    if (typeof v !== "string") return v;
    try {
      return JSON.parse(v);
    } catch {
      return v;
    }
  }, shape);
}
