import { brand } from "@/brand";

/**
 * Animación de carga: el logo se arma pieza por pieza.
 *
 * Para el logo definitivo basta con cambiar PIECES: cada pieza es un polígono del
 * logo (mismas coordenadas que public/brand/logo.svg, en un cuadro de 64×64) y
 * `from` es desde dónde entra volando (dx, dy, en las mismas unidades).
 * Las piezas entran en el orden de la lista.
 */
const PIECES: { points: string; fill: string; opacity?: number; from: [number, number] }[] = [
  { points: "6,22 20,36 6,50", fill: "#14d1c6", from: [-22, 10] },
  { points: "58,22 58,50 44,36", fill: "#ff8fb3", from: [22, 10] },
  { points: "6,22 20,8 34,22 20,36", fill: "#5b3fe0", opacity: 0.92, from: [-14, -20] },
  { points: "30,22 44,8 58,22 44,36", fill: "#c86fd0", opacity: 0.85, from: [14, -20] },
  { points: "18,34 32,20 46,34 32,48", fill: "#8f5ce0", opacity: 0.8, from: [0, 24] },
];

export function LogoLoader({ label = "Cargando…", size = 72 }: { label?: string; size?: number }) {
  return (
    <div role="status" aria-live="polite" className="logo-loader flex flex-col items-center gap-3">
      <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden className="overflow-visible">
        <g style={{ mixBlendMode: "multiply" }}>
          {PIECES.map((p, i) => (
            <polygon
              key={i}
              points={p.points}
              fill={p.fill}
              fillOpacity={p.opacity ?? 1}
              className="logo-loader-piece"
              style={
                {
                  "--dx": `${p.from[0]}px`,
                  "--dy": `${p.from[1]}px`,
                  animationDelay: `${i * 0.12}s`,
                } as React.CSSProperties
              }
            />
          ))}
        </g>
      </svg>
      <p className="logo-loader-name text-lg font-black tracking-tight">{brand.name}</p>
      <span className="sr-only">{label}</span>
    </div>
  );
}
