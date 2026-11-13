import type { Metadata } from "next";
import { hasSupabaseEnv } from "@/lib/env";
import { getMovingData } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { SetupNotice } from "@/components/SetupNotice";
import { QuoteWizard, type Slot } from "./QuoteWizard";

export const metadata: Metadata = { title: "Cotizar mudanza" };

function isoDay(d: Date) {
  return d.toLocaleDateString("en-CA", { timeZone: "America/Santiago" });
}

export default async function CotizarPage({ searchParams }: PageProps<"/mudanzas/cotizar">) {
  if (!hasSupabaseEnv()) return <SetupNotice />;
  const sp = await searchParams;
  const { services, settings } = await getMovingData();
  if (!settings || services.length === 0) {
    return <p className="text-center text-muted">Aún no hay servicios configurados.</p>;
  }

  const supabase = await createClient();
  const today = new Date();
  const until = new Date(today.getTime() + settings.booking_days_ahead * 86400_000);
  const { data } = await supabase.rpc("get_availability", { p_from: isoDay(today), p_to: isoDay(until) });

  return (
    <QuoteWizard
      services={services}
      settings={settings}
      slots={(data ?? []) as Slot[]}
      initialService={typeof sp.servicio === "string" ? sp.servicio : undefined}
    />
  );
}
