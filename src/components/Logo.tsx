import Image from "next/image";
import { brand } from "@/brand";

/** Logo + nombre. Se configura en src/brand.ts */
export function Logo() {
  return (
    <span className="flex items-center gap-2">
      {brand.logoImage ? (
        <Image src={brand.logoImage} alt="" width={32} height={32} className="h-8 w-8" priority unoptimized />
      ) : (
        // Caja de mudanza dibujada (se reemplaza al poner logoImage en src/brand.ts)
        <span aria-hidden className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand">
          <span className="h-3 w-3.5 rounded-[2px] border-2 border-t-4 border-white" />
        </span>
      )}
      <span className="tracking-tight">{brand.name}</span>
    </span>
  );
}
