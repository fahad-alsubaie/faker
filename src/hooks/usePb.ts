import { useCallback, useEffect, useRef, useState } from "react";
import { pb, reauth } from "../lib/pb";
import { getStoredPlayer } from "../lib/storage";

export function useAuthGate() {
  const [ready, setReady] = useState(false);
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const stored = getStoredPlayer();
    if (!stored?.username || !stored?.password) {
      setReady(true);
      setAuthed(pb.authStore.isValid);
      return;
    }
    reauth(stored.username, stored.password)
      .then((ok) => {
        if (!cancelled) {
          setAuthed(ok);
          setReady(true);
        }
      })
      .catch(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { ready, authed };
}

type Unsubscribe = () => void;

async function subscribeWithRefetch(
  collection: string,
  filter: string,
  refetch: () => void,
): Promise<Unsubscribe> {
  const unsub = await pb.collection(collection).subscribe(filter, () => refetch());
  return unsub;
}

export function usePbRecord<T extends { id: string }>(
  collection: string,
  recordId: string | undefined,
) {
  const [record, setRecord] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const filterKey = recordId ?? "";

  const refetch = useCallback(async () => {
    if (!recordId) {
      setRecord(null);
      setLoading(false);
      return;
    }
    try {
      const item = await pb.collection(collection).getOne<T>(recordId);
      setRecord(item);
      setError(null);
    } catch (err: any) {
      setRecord(null);
      if (err?.status === 404) setError("not-found");
      else setError(err?.message || "فشل الاتصال");
    } finally {
      setLoading(false);
    }
  }, [collection, recordId]);

  useEffect(() => {
    let cancelled = false;
    let unsub: Unsubscribe | undefined;
    let timer: ReturnType<typeof setInterval> | undefined;

    const setup = async () => {
      await refetch();
      if (cancelled || !recordId) return;
      try {
        unsub = await subscribeWithRefetch(collection, recordId, () => {
          if (!cancelled) refetch();
        });
      } catch {
        // SSE unavailable -> polling fallback keeps the game playable
      }
      timer = setInterval(() => {
        if (!cancelled) refetch();
      }, 20000);
    };
    setup();

    const onVisible = () => {
      if (document.visibilityState === "visible" && !cancelled) refetch();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      if (unsub) unsub();
      if (timer) clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [collection, filterKey, refetch]);

  return { record, loading, error };
}

export function usePbList<T extends { id: string }>(
  collection: string,
  filter: string | undefined,
  sort = "created,id",
  extraKey?: string,
) {
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const filterKey = filter ?? "skip";

  const refetch = useCallback(async () => {
    if (!filter) {
      setItems([]);
      setLoading(false);
      return;
    }
    try {
      const list = await pb.collection(collection).getFullList<T>({ filter, sort });
      setItems(list);
      setLoading(false);
    } catch {
      setLoading(false);
    }
  }, [collection, filter, sort]);

  // records of this collection may not change when their VISIBILITY changes
  // (phase-gated API rules) -> callers pass extraKey (e.g. game status) to force a refetch
  useEffect(() => {
    if (extraKey !== undefined) refetch();
  }, [extraKey, refetch]);

  useEffect(() => {
    let cancelled = false;
    let unsub: Unsubscribe | undefined;
    let timer: ReturnType<typeof setInterval> | undefined;

    const setup = async () => {
      await refetch();
      if (cancelled || !filter) return;
      try {
        unsub = await subscribeWithRefetch(collection, filter, () => {
          if (!cancelled) refetch();
        });
      } catch {
        // SSE unavailable -> polling fallback keeps the game playable
      }
      timer = setInterval(() => {
        if (!cancelled) refetch();
      }, 20000);
    };
    setup();

    const onVisible = () => {
      if (document.visibilityState === "visible" && !cancelled) refetch();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      if (unsub) unsub();
      if (timer) clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [collection, filterKey, refetch]);

  return { items, loading };
}
