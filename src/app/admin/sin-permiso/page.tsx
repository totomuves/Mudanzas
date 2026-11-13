import { Icon } from "@/components/Icon";

export default function SinPermisoPage() {
  return (
    <div className="mx-auto max-w-md space-y-3 py-10 text-center">
      <Icon name="lock" className="mx-auto h-12 w-12 text-muted" strokeWidth={1.4} />
      <h1 className="text-2xl font-black">Tu cuenta no es administradora</h1>
      <p className="text-sm text-muted">
        Pide que activen tu usuario como admin (en el README está la consulta SQL para hacerlo).
      </p>
    </div>
  );
}
