import { useCallback, useEffect, useRef, useState } from "react";
import type { FunctionReference, FunctionReturnType } from "convex/server";
import { convexHttp } from "../lib/convex-http";

type QueryArgs = Record<string, unknown> | undefined | "skip";

export function useHttpQuery<Query extends FunctionReference<"query">>(
  query: Query,
  args: QueryArgs,
  intervalMs = 2000,
) {
  type Result = FunctionReturnType<Query>;
  const [data, setData] = useState<Result | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const argsRef = useRef<QueryArgs>(args);
  argsRef.current = args;

  const argsKey =
    args === undefined || args === "skip" ? "skip" : JSON.stringify(args);

  useEffect(() => {
    if (argsKey === "skip") {
      setData(undefined);
      setError(null);
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | undefined;

    const fetchData = async () => {
      try {
        const result = (await convexHttp.query(
          query,
          argsRef.current as any,
        )) as Result;
        if (!cancelled) {
          setData(result);
          setError(null);
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.message || "فشل الاتصال");
        }
      }
    };

    fetchData();
    timer = setInterval(fetchData, intervalMs);

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [query, argsKey, intervalMs]);

  const loading = data === undefined && error === null && argsKey !== "skip";
  return { data, error, loading };
}

export function useHttpMutation<
  Mutation extends FunctionReference<"mutation">,
>(mutation: Mutation) {
  type Result = FunctionReturnType<Mutation>;

  const mutate = useCallback(
    async (args: Record<string, unknown>): Promise<Result> => {
      return (await convexHttp.mutation(mutation, args as any)) as Result;
    },
    [mutation],
  );

  return mutate;
}
