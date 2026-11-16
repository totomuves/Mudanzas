import { redirect } from "next/navigation";

/** Los trabajos realizados ahora se editan junto con los banners, en "Banners y fotos de páginas". */
export default function TrabajosAdminPage() {
  redirect("/admin/paginas?pagina=conocenos#fotos");
}
