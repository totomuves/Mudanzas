import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { hasSupabaseEnv } from "@/lib/env";
import { getUser } from "@/lib/supabase/server";
import { formatCLP } from "@/lib/format";
import { BOOKING_STATUS, formatDay } from "@/lib/moving";
import { SetupNotice } from "@/components/SetupNotice";
import { Icon, ServiceIcon } from "@/components/Icon";

export const metadata: Metadata = { title: "Tu reserva" };

export default async function ReservaPage({ params }: PageProps<"/mudanzas/reserva/[id]">) {
  if (!hasSupabaseEnv()) return <SetupNotice />;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase, user } = await getUser();
  if (!user) notFound();

  const [{ data: b }, { data: settings }] = await Promise.all([
    supabase.from("bookings").select("*, service_types(slug, name)").eq("id", id).maybeSingle(),
    supabase.from("moving_settings").select("whatsapp").eq("id", 1).maybeSingle(),
  ]);
  if (!b) notFound();
  const st = BOOKING_STATUS[b.status];
  const wa = settings?.whatsapp?.replace(/\D/g, "");
  const waText = encodeURIComponent(`Hola, hice la reserva #${String(b.id).slice(0, 8)} para el ${formatDay(b.day).toLowerCase()} a las ${b.slot_time}.`);

  return (
    <div className="mx-auto max-w-md space-y-5 text-center">
      <div className="animate-pop flex justify-center text-brand">
        <Icon name={b.status === "requested" ? "party" : st.icon} className="h-16 w-16" strokeWidth={1.4} />
      </div>
      <h1 className="text-3xl font-black">{b.status === "requested" ? "¡Reserva recibida!" : `Reserva ${st.label.toLowerCase()}`}</h1>
      {b.status === "requested" && (
        <p className="text-muted">Te escribiremos por WhatsApp para confirmar los detalles. Tu horario ya quedó apartado.</p>
      )}
      <div className="space-y-1.5 rounded-card bg-surface p-4 text-left text-sm [&>p]:flex [&>p]:items-start [&>p]:gap-2">
        <p className="font-extrabold">
          <ServiceIcon slug={b.service_types?.slug ?? ""} className="h-5 w-5" /> {b.service_types?.name}
        </p>
        <p><Icon name="calendar" className="mt-0.5 h-4 w-4" /><span className="first-letter:uppercase">{formatDay(b.day)} · {b.slot_time} hrs</span></p>
        <p><Icon name="pin" className="mt-0.5 h-4 w-4" />{b.origin_address}, {b.origin_comuna}</p>
        <p><Icon name="flag" className="mt-0.5 h-4 w-4" />{b.dest_address}, {b.dest_comuna}</p>
        <p className="pt-2 text-base font-black">Total estimado: {formatCLP(b.estimated_price)}</p>
        <p className="text-xs text-muted">Reserva #{String(b.id).slice(0, 8)} · {st.label}</p>
      </div>
      <div className="flex flex-col gap-2">
        {wa && (
          <a href={`https://wa.me/${wa}?text=${waText}`} target="_blank" rel="noreferrer" className="rounded-full bg-[#25d366] py-3 font-extrabold text-white">
            Escribirnos por WhatsApp
          </a>
        )}
        <Link href="/descubrir" className="rounded-full border-2 border-border py-3 font-extrabold">
          Mientras tanto, mira la tienda
        </Link>
      </div>
    </div>
  );
}
