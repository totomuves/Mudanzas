"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { hasSupabaseEnv } from "@/lib/env";
import { Icon } from "./Icon";

/** Campana con la cantidad de avisos sin leer ("Llegó algo para ti"). */
export function NotificationBell({ className = "" }: { className?: string }) {
  const pathname = usePathname();
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!hasSupabaseEnv()) return;
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const { data } = await supabase.auth.getSession();
      const uid = data.session?.user.id;
      if (!uid) return;
      const { count, error } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", uid)
        .is("read_at", null);
      if (!cancelled && !error) setUnread(count ?? 0);
    })();
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  return (
    <Link
      href="/avisos"
      aria-label={unread ? `Avisos (${unread} sin leer)` : "Avisos"}
      className={`relative flex h-10 w-10 items-center justify-center rounded-full hover:bg-surface ${className}`}
    >
      <Icon name="bell" className="h-6 w-6" />
      {unread > 0 && (
        <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-black text-white">
          {unread > 9 ? "9+" : unread}
        </span>
      )}
    </Link>
  );
}
