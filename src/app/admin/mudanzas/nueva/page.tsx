import type { Metadata } from "next";
import { hasSupabaseEnv } from "@/lib/env";
import { requireSection } from "@/lib/admin";
import { SetupNotice } from "@/components/SetupNotice";
import type { MovingSettings, ServiceType } from "@/lib/moving";
import { MudanzasTabs } from "../Tabs";
import { BookingForm } from "../BookingForm";

export const metadata: Metadata = { title: "Nueva mudanza" };

export default async function NuevaMudanzaPage() {
  if (!hasSupabaseEnv()) return <SetupNotice />;
  const { supabase } = await requireSection("mudanzas");
  const [{ data: services }, { data: settings }] = await Promise.all([
    supabase.from("service_types").select("*").order("sort_order"),
    supabase.from("moving_settings").select("*").eq("id", 1).maybeSingle(),
  ]);
  const s = settings as MovingSettings | null;

  return (
    <div className="space-y-6">
      <MudanzasTabs active="/admin/mudanzas/nueva" />
      <div className="space-y-1">
        <h1 className="text-2xl font-black">Nueva mudanza</h1>
        <p className="text-muted">Para mudanzas que llegan por teléfono, WhatsApp o en persona. Queda en la agenda igual que las de la web.</p>
      </div>
      <BookingForm
        services={(services ?? []) as ServiceType[]}
        settings={s}
        values={{
          service_slug: "",
          day: "",
          slot_time: s?.slot_times[0] ?? "09:00",
          origin_address: "",
          origin_comuna: "",
          origin_floor: 1,
          origin_elevator: false,
          dest_address: "",
          dest_comuna: "",
          dest_floor: 1,
          dest_elevator: false,
          distance: "misma_comuna",
          packing: false,
          heavy_items: 0,
          notes: "",
          contact_name: "",
          contact_email: "",
          contact_phone: "",
          estimated_price: null,
          status: "confirmed",
        }}
      />
    </div>
  );
}
