import "server-only";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/supabase/server";

/** Exige un usuario administrador; si no, redirige. */
export async function requireAdmin() {
  const { supabase, user } = await getUser();
  if (!user || user.is_anonymous) redirect("/ingresar?next=/admin");
  const { data } = await supabase.from("profiles").select("is_admin").eq("id", user.id).maybeSingle();
  if (!data?.is_admin) {
    // Los vendedores que entran por /ingresar llegan aquí: los mandamos a su panel
    const { data: seller } = await supabase.from("sellers").select("id").eq("owner_id", user.id).maybeSingle();
    redirect(seller ? "/vendedor" : "/admin/sin-permiso");
  }
  return { supabase, user };
}
