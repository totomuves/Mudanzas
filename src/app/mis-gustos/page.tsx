import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { hasSupabaseEnv } from "@/lib/env";
import { getCategories } from "@/lib/data";
import { getUser } from "@/lib/supabase/server";
import { SetupNotice } from "@/components/SetupNotice";
import type { MovingContext, Profile, UserTaste } from "@/lib/types";
import { TasteEditor } from "./TasteEditor";

export const metadata: Metadata = { title: "Mis gustos" };

export default async function MisGustosPage() {
  if (!hasSupabaseEnv()) return <SetupNotice />;
  const { supabase, user } = await getUser();
  if (!user) redirect("/bienvenida");

  // Recalcula con lo último que hizo, para mostrar lo más fresco
  const refreshed = await supabase.rpc("refresh_my_taste", { p_force: true });
  if (refreshed.error) {
    // Aún no se corre la migración del recomendador: se usa la pantalla anterior
    redirect("/bienvenida");
  }

  const [categories, { data: taste }, { data: profile }, { data: contexts }, { data: prefs }, { data: selected }, { count: likes }] =
    await Promise.all([
      getCategories(),
      supabase
        .from("user_taste")
        .select("traits, price_mu, price_sigma, n_pos, n_neg, n_events, last_event_at")
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
      supabase.from("moving_contexts").select("*").order("sort_order"),
      supabase.from("user_trait_prefs").select("trait, adjust").eq("user_id", user.id),
      supabase.from("user_categories").select("category_slug").eq("user_id", user.id).eq("selected", true),
      supabase
        .from("swipes")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id)
        .in("action", ["like", "superlike"]),
    ]);

  if (!profile?.onboarded) redirect("/bienvenida");

  return (
    <div className="mx-auto max-w-2xl space-y-2">
      <TasteEditor
        userId={user.id}
        categories={categories}
        taste={(taste as UserTaste | null) ?? null}
        profile={profile as Profile}
        contexts={(contexts ?? []) as MovingContext[]}
        initialPrefs={Object.fromEntries(((prefs ?? []) as { trait: string; adjust: number }[]).map((p) => [p.trait, p.adjust]))}
        initialSelected={((selected ?? []) as { category_slug: string }[]).map((s) => s.category_slug)}
        likes={likes ?? 0}
      />
      <p className="pt-4 text-center text-xs text-muted">
        Esto solo lo ves tú. Lo usamos para ordenar <Link href="/descubrir" className="underline">Descubrir</Link> y
        avisarte de productos que te pueden gustar.
      </p>
    </div>
  );
}
