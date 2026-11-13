import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { hasSupabaseEnv } from "@/lib/env";
import { getCategories } from "@/lib/data";
import { getUser } from "@/lib/supabase/server";
import { SetupNotice } from "@/components/SetupNotice";
import type { UserCategory } from "@/lib/types";
import { SwipeDeck } from "./SwipeDeck";

export const metadata: Metadata = { title: "Descubrir" };

export default async function DescubrirPage() {
  if (!hasSupabaseEnv()) return <SetupNotice />;
  const { supabase, user } = await getUser();
  if (!user) redirect("/bienvenida");

  const [{ data: profile }, categories, { data: prefs }, { count }] = await Promise.all([
    supabase.from("profiles").select("onboarded").eq("id", user.id).maybeSingle(),
    getCategories(),
    supabase.from("user_categories").select("category_slug, weight, selected").eq("user_id", user.id),
    supabase.from("swipes").select("*", { count: "exact", head: true }).eq("user_id", user.id),
  ]);
  if (!profile?.onboarded) redirect("/bienvenida");

  return (
    <SwipeDeck
      userId={user.id}
      categories={categories}
      initialPrefs={(prefs ?? []) as UserCategory[]}
      initialSwipeCount={count ?? 0}
    />
  );
}
