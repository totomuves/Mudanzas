import { LogoLoader } from "@/components/LogoLoader";

/** Se muestra mientras una página se demora en cargar (Next.js la usa en toda la app). */
export default function Loading() {
  return (
    <div className="flex min-h-[60svh] items-center justify-center">
      <LogoLoader />
    </div>
  );
}
