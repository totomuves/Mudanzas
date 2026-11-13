import type { Metadata } from "next";
import { hasSupabaseEnv } from "@/lib/env";
import { getCategories } from "@/lib/data";
import { getUser } from "@/lib/supabase/server";
import { SetupNotice } from "@/components/SetupNotice";
import type { Profile } from "@/lib/types";
import { Onboarding } from "./Onboarding";

export const metadata: Metadata = { title: "Tus gustos" };

export default async function BienvenidaPage() {
  if (!hasSupabaseEnv()) return <SetupNotice />;
  const [categories, { supabase, user }] = await Promise.all([getCategories(), getUser()]);

  let profile: Profile | null = null;
  let selected: string[] = [];
  if (user) {
    const [p, uc] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
      supabase.from("user_categories").select("category_slug").eq("user_id", user.id).eq("selected", true),
    ]);
    profile = p.data as Profile | null;
    selected = (uc.data ?? []).map((r: { category_slug: string }) => r.category_slug);
  }

  return <Onboarding categories={categories} initialSelected={selected} profile={profile} />;
}
