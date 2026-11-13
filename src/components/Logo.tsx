import Image from "next/image";
import { brand } from "@/brand";

/** Logo + nombre. Se configura en src/brand.ts */
export function Logo() {
  return (
    <span className="flex items-center gap-2">
      {brand.logoImage ? (
        <Image src={brand.logoImage} alt="" width={32} height={32} className="h-8 w-auto" priority />
      ) : (
        <span aria-hidden className="text-2xl">{brand.logoEmoji}</span>
      )}
      <span>{brand.name}</span>
    </span>
  );
}
