import { useCallback } from "react";
import { type AsyncQueryState, useAsyncQuery } from "./useAsyncQuery";

const DEBOUNCE_MS = 80;

export function useCommandHistory(
  term: string,
  enabled: boolean,
): AsyncQueryState<string> {
  const run = useCallback(
    async (_q: string) => [] as string[],
    [],
  );

  return useAsyncQuery({
    enabled,
    term,
    minLength: 0,
    debounceMs: DEBOUNCE_MS,
    run,
  });
}
