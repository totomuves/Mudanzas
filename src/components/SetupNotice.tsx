/** Se muestra mientras falten las variables de entorno de Supabase. */
export function SetupNotice() {
  return (
    <div className="mx-auto max-w-lg rounded-2xl border border-border bg-card p-6 text-center">
      <div className="text-5xl">🛠️</div>
      <h1 className="mt-2 text-xl font-extrabold">Falta conectar Supabase</h1>
      <p className="mt-2 text-sm text-muted">
        Copia <code>.env.example</code> como <code>.env.local</code>, completa las claves de tu
        proyecto de Supabase y reinicia <code>npm run dev</code>. Los pasos están en el README.
      </p>
    </div>
  );
}
