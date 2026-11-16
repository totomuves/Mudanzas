import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { brand } from "@/brand";

/** Imagen que aparece al compartir el link del sitio (WhatsApp, Instagram, Facebook…). */
export async function GET() {
  const logo = await readFile(join(process.cwd(), "public/brand/logo.svg"), "utf8").catch(() => "");
  const logoSrc = logo ? `data:image/svg+xml;base64,${Buffer.from(logo).toString("base64")}` : null;
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          background: "linear-gradient(135deg, #efebfd 0%, #ffffff 45%, #e6faf8 100%)",
          color: "#141414",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- imagen generada, no una página */}
          {logoSrc && <img src={logoSrc} width={120} height={120} alt="" />}
          <div style={{ fontSize: 96, fontWeight: 800, letterSpacing: -2, color: "#5b3fe0" }}>{brand.name}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ fontSize: 64, fontWeight: 800, lineHeight: 1.1, maxWidth: 950 }}>{brand.hero.title}</div>
          <div style={{ fontSize: 34, color: "#555", maxWidth: 950 }}>{brand.description}</div>
        </div>
        <div style={{ display: "flex", height: 14, borderRadius: 7, background: "linear-gradient(90deg, #5b3fe0, #e0609a, #14d1c6)" }} />
      </div>
    ),
    { width: 1200, height: 630, headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" } },
  );
}
