import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { hasSupabaseEnv } from "@/lib/env";
import { requireSection } from "@/lib/admin";
import { SetupNotice } from "@/components/SetupNotice";
import type { MovingSettings, ServiceType } from "@/lib/moving";
import { MudanzasTabs } from "../Tabs";
import { BookingForm, type BookingValues } from "../BookingForm";
import { VehicleSuggestion } from "./VehicleSuggestion";

export const metadata: Metadata = { title: "Editar mudanza" };

export default async function EditarMudanzaPage({ params }: PageProps<"/admin/mudanzas/[id]">) {
  if (!hasSupabaseEnv()) return <SetupNotice />;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase } = await requireSection("mudanzas");
  const [{ data: booking }, { data: services }, { data: settings }] = await Promise.all([
    supabase.from("bookings").select("*").eq("id", id).maybeSingle(),
    supabase.from("service_types").select("*").order("sort_order"),
    supabase.from("moving_settings").select("*").eq("id", 1).maybeSingle(),
  ]);
  if (!booking) notFound();

  return (
    <div className="space-y-6">
      <MudanzasTabs active="/admin/mudanzas" />
      <div className="space-y-1">
        <h1 className="text-2xl font-black">Editar mudanza</h1>
        <p className="text-sm text-muted">
          #{id.slice(0, 8)} · {booking.source === "admin" ? "creada desde el admin" : "reservada en la web"}
        </p>
      </div>
      <BookingForm
        services={(services ?? []) as ServiceType[]}
        settings={settings as MovingSettings | null}
        values={booking as BookingValues}
      />
      <Suspense fallback={<p className="text-sm text-muted">Calculando qué vehículo conviene…</p>}>
        <VehicleSuggestion
          booking={booking}
          estHours={Number(((services ?? []) as ServiceType[]).find((s) => s.slug === booking.service_slug)?.est_hours ?? 4)}
        />
      </Suspense>
    </div>
  );
}
