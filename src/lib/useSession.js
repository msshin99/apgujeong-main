import { useEffect, useState } from "react";
import { supabase, isSupabaseReady } from "./supabase.js";

/**
 * 로그인 상태.
 *
 * 새로고침하면 세션이 메모리에서 사라지므로 시작할 때 getSession() 으로 복원하고,
 * 이후 변화는 onAuthStateChange 로 따라간다. 둘 중 하나만 하면
 * "로그인은 됐는데 새로고침하면 풀린다" 또는 "로그아웃해도 화면이 그대로다" 가 된다.
 */
export function useSession() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isSupabaseReady) {
      setLoading(false);
      return;
    }

    let alive = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      setSession(data.session);
      setLoading(false);
    });

    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });

    return () => {
      alive = false;
      data.subscription.unsubscribe();
    };
  }, []);

  return { session, loading };
}
