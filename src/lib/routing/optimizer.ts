/**
 * OPTIMIZADOR DE RUTAS (sin dependencias, corre en el servidor)
 *
 * Resuelve el problema de reparto con varios vehículos distintos (VRP):
 *  - capacidad de cada vehículo en kg y m³
 *  - tamaño máximo de producto que acepta cada vehículo (un sofá no va en auto)
 *  - ventana horaria de cada comprador (mañana / tarde / cualquiera)
 *  - tiempo de atención en cada parada (más si el producto es grande)
 *  - tráfico según la hora del día (los tramos en hora punta duran más)
 *  - costo por km de cada vehículo: prefiere el más barato que sirva
 *  - jornada de cada vehículo (sale y vuelve a bodega)
 *
 * Método:
 *  1. Construcción con inserción por "arrepentimiento" (regret-2): primero se
 *     ubican las paradas que más perderían si se dejan para después.
 *  2. Mejora con "destruir y reconstruir" (ruin & recreate, como SISR): saca
 *     grupos de paradas cercanas y las vuelve a insertar de la mejor forma,
 *     aceptando a veces soluciones peores (recocido simulado) para no
 *     quedarse en un óptimo local.
 *  3. Pulido final de cada ruta con 2-opt y or-opt.
 */

export type OptStop = {
  id: string;
  node: number; // índice en la matriz
  kg: number;
  m3: number;
  sizeRank: number; // 0 chico … 3 muy grande
  service: number; // segundos de atención
  twStart: number; // segundos desde medianoche
  twEnd: number;
};

export type OptVehicle = {
  id: string;
  capKg: number;
  capM3: number;
  maxSizeRank: number;
  costPerKm: number;
  start: number; // segundos desde medianoche
  end: number;
  startNode: number;
  endNode: number;
  fixedCost?: number;
};

export type OptMatrix = {
  dur: number[][]; // segundos
  dist: number[][]; // metros
  /** Multiplicador de tráfico según la hora (segundos desde medianoche). */
  factor?: (t: number) => number;
};

export type OptOptions = {
  timeLimitMs?: number;
  maxIterations?: number;
  seed?: number;
  /** Repartir el trabajo parejo entre vehículos (penaliza la ruta más larga). */
  balance?: boolean;
  /** Costo de una hora de trabajo del equipo (CLP). */
  hourCost?: number;
  /** false: nunca deja paradas fuera por horario (para recalcular una ruta en curso). */
  hardLimits?: boolean;
};

export type OptVisit = { id: string; arrival: number; start: number; departure: number; wait: number; late: number; legDist: number };
export type OptRoute = {
  vehicleId: string;
  visits: OptVisit[];
  departure: number;
  end: number;
  distance: number;
  duration: number;
  kg: number;
  m3: number;
  late: number;
  overtime: number;
};
export type OptResult = {
  routes: OptRoute[];
  unassigned: { id: string; reason: string }[];
  cost: number;
  iterations: number;
  ms: number;
};

const LATE_PER_S = 40; // llegar tarde a la ventana se castiga fuerte
const OVERTIME_PER_S = 15;
const UNASSIGNED = 5e7;
const BALANCE_PER_S = 2;
const HARD_OVERTIME = 3600;
const HARD_LATE = 45 * 60;

// Generador aleatorio con semilla (resultados repetibles)
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function optimizeRoutes(stops: OptStop[], vehicles: OptVehicle[], m: OptMatrix, opts: OptOptions = {}): OptResult {
  const t0 = Date.now();
  const timeLimit = opts.timeLimitMs ?? 4000;
  const maxIter = opts.maxIterations ?? 100000;
  const rand = rng(opts.seed ?? 12345);
  const timeCost = (opts.hourCost ?? 9000) / 3600;
  const factor = m.factor ?? (() => 1);
  const hard = opts.hardLimits ?? true;
  const tt = (i: number, j: number, t: number) => m.dur[i][j] * factor(t);

  // ---------- Evaluación de una ruta ----------
  type Eval = { cost: number; feasible: boolean; detail?: OptRoute };
  function evaluate(vi: number, seq: number[], detail = false): Eval {
    const v = vehicles[vi];
    if (seq.length === 0) {
      return { cost: 0, feasible: true, detail: detail ? emptyRoute(v) : undefined };
    }
    let kg = 0, m3 = 0;
    for (const si of seq) {
      const s = stops[si];
      if (s.sizeRank > v.maxSizeRank) return { cost: Infinity, feasible: false };
      kg += s.kg;
      m3 += s.m3;
    }
    if (kg > v.capKg + 1e-6 || m3 > v.capM3 + 1e-6) return { cost: Infinity, feasible: false };

    // Sale lo más tarde posible sin esperar en la primera parada
    const first = stops[seq[0]];
    const firstLeg = tt(v.startNode, first.node, v.start);
    const departure = Math.max(v.start, first.twStart - firstLeg);
    let t = departure;
    let prev = v.startNode;
    let dist = 0, late = 0, maxLate = 0;
    const visits: OptVisit[] = [];
    for (const si of seq) {
      const s = stops[si];
      const arrival = t + tt(prev, s.node, t);
      const legDist = m.dist[prev][s.node];
      dist += legDist;
      const start = Math.max(arrival, s.twStart);
      const lateHere = Math.max(0, arrival - s.twEnd);
      late += lateHere;
      if (lateHere > maxLate) maxLate = lateHere;
      t = start + s.service;
      if (detail) visits.push({ id: s.id, arrival, start, departure: t, wait: start - arrival, late: lateHere, legDist });
      prev = s.node;
    }
    const end = t + tt(prev, v.endNode, t);
    dist += m.dist[prev][v.endNode];
    const overtime = Math.max(0, end - v.end);
    // Límites duros: más de 1 hora extra o llegar más de 45 min tarde a alguien no se acepta
    if (!detail && hard && (overtime > HARD_OVERTIME || maxLate > HARD_LATE)) return { cost: Infinity, feasible: true };
    const duration = end - departure;
    const cost =
      duration * timeCost + (dist / 1000) * v.costPerKm + late * LATE_PER_S + overtime * OVERTIME_PER_S + (v.fixedCost ?? 0);
    return {
      cost,
      feasible: true,
      detail: detail
        ? { vehicleId: v.id, visits, departure, end, distance: dist, duration, kg, m3, late, overtime }
        : undefined,
    };
  }

  function emptyRoute(v: OptVehicle): OptRoute {
    return { vehicleId: v.id, visits: [], departure: v.start, end: v.start, distance: 0, duration: 0, kg: 0, m3: 0, late: 0, overtime: 0 };
  }

  // ---------- Estado de la solución ----------
  type Sol = { routes: number[][]; costs: number[]; unassigned: Set<number> };

  function balancePenalty(costs: number[], routes: number[][]) {
    if (!opts.balance) return 0;
    let max = 0;
    routes.forEach((r, vi) => {
      if (r.length) max = Math.max(max, (evaluate(vi, r, true).detail?.duration ?? 0));
    });
    return max * BALANCE_PER_S;
  }

  function total(s: Sol) {
    return s.costs.reduce((a, b) => a + b, 0) + s.unassigned.size * UNASSIGNED + balancePenalty(s.costs, s.routes);
  }

  function clone(s: Sol): Sol {
    return { routes: s.routes.map((r) => r.slice()), costs: s.costs.slice(), unassigned: new Set(s.unassigned) };
  }

  // Mejor lugar para insertar una parada en una ruta
  function bestInsertion(vi: number, route: number[], routeCost: number, si: number, noise: number) {
    let best = Infinity, pos = -1;
    for (let p = 0; p <= route.length; p++) {
      const seq = route.slice(0, p).concat(si, route.slice(p));
      const e = evaluate(vi, seq);
      // Si no cabe por carga o tamaño, en ninguna posición cabrá
      if (!e.feasible) break;
      let delta = e.cost - routeCost;
      if (noise) delta *= 1 + (rand() - 0.5) * noise;
      if (delta < best) {
        best = delta;
        pos = p;
      }
    }
    return { delta: best, pos };
  }

  // Inserción por arrepentimiento (regret-2) con caché por ruta
  function recreate(s: Sol, noise = 0) {
    const cache = new Map<string, { delta: number; pos: number }>();
    const key = (si: number, vi: number) => `${si}:${vi}`;
    while (s.unassigned.size) {
      let pick = -1, pickV = -1, pickPos = -1, pickRegret = -Infinity, pickDelta = Infinity;
      for (const si of s.unassigned) {
        let b1 = Infinity, b2 = Infinity, bv = -1, bp = -1;
        for (let vi = 0; vi < vehicles.length; vi++) {
          let c = cache.get(key(si, vi));
          if (!c) {
            c = bestInsertion(vi, s.routes[vi], s.costs[vi], si, noise);
            cache.set(key(si, vi), c);
          }
          if (c.delta < b1) {
            b2 = b1;
            b1 = c.delta;
            bv = vi;
            bp = c.pos;
          } else if (c.delta < b2) b2 = c.delta;
        }
        if (bv < 0) continue;
        const regret = (b2 === Infinity ? 1e9 : b2 - b1) + (rand() * noise * 50);
        if (regret > pickRegret || (regret === pickRegret && b1 < pickDelta)) {
          pickRegret = regret;
          pickDelta = b1;
          pick = si;
          pickV = bv;
          pickPos = bp;
        }
      }
      if (pick < 0) break; // las que quedan no caben en ningún vehículo
      s.routes[pickV].splice(pickPos, 0, pick);
      s.costs[pickV] = evaluate(pickV, s.routes[pickV]).cost;
      s.unassigned.delete(pick);
      for (const si of s.unassigned) cache.delete(key(si, pickV));
    }
  }

  // ---------- Destruir: saca paradas cercanas entre sí ----------
  const n = stops.length;
  const neighbors: number[][] = stops.map((a) =>
    stops
      .map((b, j) => [j, m.dur[a.node][b.node] + m.dur[b.node][a.node]] as const)
      .sort((x, y) => x[1] - y[1])
      .map(([j]) => j),
  );
  const routeOf = (s: Sol) => {
    const r = new Array<number>(n).fill(-1);
    s.routes.forEach((route, vi) => route.forEach((si) => (r[si] = vi)));
    return r;
  };

  function ruin(s: Sol) {
    const assigned = n - s.unassigned.size;
    if (assigned === 0) return;
    const k = Math.max(1, Math.min(assigned, Math.round(2 + rand() * Math.min(14, assigned * 0.35))));
    const where = routeOf(s);
    const touched = new Set<number>();
    const mode = rand();
    if (mode < 0.15) {
      // Aleatoria
      const pool = stops.map((_, i) => i).filter((i) => where[i] >= 0);
      for (let c = 0; c < k && pool.length; c++) {
        const i = pool.splice(Math.floor(rand() * pool.length), 1)[0];
        s.routes[where[i]].splice(s.routes[where[i]].indexOf(i), 1);
        touched.add(where[i]);
        s.unassigned.add(i);
      }
    } else {
      // Por cercanía, sacando tramos de cada ruta tocada (tipo SISR)
      const pool = stops.map((_, i) => i).filter((i) => where[i] >= 0);
      const start = pool[Math.floor(rand() * pool.length)];
      let removed = 0;
      for (const j of neighbors[start]) {
        if (removed >= k) break;
        const vi = where[j];
        if (vi < 0 || touched.has(vi)) continue;
        const route = s.routes[vi];
        const len = Math.max(1, Math.min(route.length, Math.round(1 + rand() * Math.min(6, k - removed))));
        const idx = route.indexOf(j);
        const from = Math.max(0, Math.min(idx - Math.floor(rand() * len), route.length - len));
        const out = route.splice(from, len);
        out.forEach((x) => s.unassigned.add(x));
        removed += out.length;
        touched.add(vi);
      }
    }
    for (const vi of touched) s.costs[vi] = evaluate(vi, s.routes[vi]).cost;
  }

  // ---------- Pulido de cada ruta: 2-opt y or-opt ----------
  function polish(s: Sol) {
    for (let vi = 0; vi < vehicles.length; vi++) {
      let route = s.routes[vi];
      let cost = s.costs[vi];
      let improved = true;
      while (improved && Date.now() - t0 < timeLimit + 1500) {
        improved = false;
        for (let i = 0; i < route.length - 1 && !improved; i++) {
          for (let j = i + 1; j < route.length && !improved; j++) {
            const cand = route.slice(0, i).concat(route.slice(i, j + 1).reverse(), route.slice(j + 1));
            const c = evaluate(vi, cand).cost;
            if (c < cost - 1e-6) {
              route = cand;
              cost = c;
              improved = true;
            }
          }
        }
        for (let len = 1; len <= 3 && !improved; len++) {
          for (let i = 0; i + len <= route.length && !improved; i++) {
            const seg = route.slice(i, i + len);
            const rest = route.slice(0, i).concat(route.slice(i + len));
            for (let p = 0; p <= rest.length && !improved; p++) {
              if (p === i) continue;
              const cand = rest.slice(0, p).concat(seg, rest.slice(p));
              const c = evaluate(vi, cand).cost;
              if (c < cost - 1e-6) {
                route = cand;
                cost = c;
                improved = true;
              }
            }
          }
        }
      }
      s.routes[vi] = route;
      s.costs[vi] = cost;
    }
  }

  // ---------- Búsqueda ----------
  let cur: Sol = { routes: vehicles.map(() => []), costs: vehicles.map(() => 0), unassigned: new Set(stops.map((_, i) => i)) };
  recreate(cur);
  let curCost = total(cur);
  let best = clone(cur);
  let bestCost = curCost;
  const T0 = Math.max(1, curCost < UNASSIGNED ? curCost * 0.02 : 1000);
  const Tf = 1;
  let it = 0;
  if (n > 1) {
    while (it < maxIter) {
      const elapsed = Date.now() - t0;
      if (elapsed > timeLimit) break;
      it++;
      const T = T0 * Math.pow(Tf / T0, elapsed / timeLimit);
      const cand = clone(cur);
      ruin(cand);
      recreate(cand, rand() < 0.5 ? 0.1 : 0);
      const c = total(cand);
      if (c < curCost - T * Math.log(rand())) {
        cur = cand;
        curCost = c;
        if (c < bestCost - 1e-6) {
          best = clone(cand);
          bestCost = c;
        }
      }
    }
  }
  polish(best);
  bestCost = total(best);

  // ---------- Resultado ----------
  const routes: OptRoute[] = [];
  best.routes.forEach((r, vi) => {
    if (!r.length) return;
    routes.push(evaluate(vi, r, true).detail!);
  });
  const unassigned = [...best.unassigned].map((si) => {
    const s = stops[si];
    const fitsSize = vehicles.some((v) => s.sizeRank <= v.maxSizeRank);
    const fitsLoad = vehicles.some((v) => s.kg <= v.capKg && s.m3 <= v.capM3 && s.sizeRank <= v.maxSizeRank);
    return {
      id: s.id,
      reason: !vehicles.length
        ? "No hay vehículos activos"
        : !fitsSize
          ? "Ningún vehículo acepta un producto de este tamaño"
          : !fitsLoad
            ? "Supera la capacidad de todos los vehículos"
            : "No alcanza en la jornada o los vehículos van llenos",
    };
  });
  return { routes, unassigned, cost: bestCost, iterations: it, ms: Date.now() - t0 };
}

// -------------------------------------------------------------
// Distancias y tráfico estimados (sin servicio de mapas)
// -------------------------------------------------------------
export function haversine(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371000;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Cuánto más lento es manejar en Santiago según la hora (1 = tráfico normal).
 * Punta mañana 7:30–9:30 y tarde 18:00–20:30.
 */
const TRAFFIC_PROFILE: [number, number][] = [
  [0, 0.75], [6.5, 0.85], [7.25, 1.3], [8, 1.6], [9.5, 1.3], [10.25, 1.05], [12.5, 1.1], [14, 1.2], [15.5, 1.05],
  [17, 1.25], [18.5, 1.65], [20, 1.35], [21, 0.95], [24, 0.75],
];
export function trafficFactor(secondsOfDay: number) {
  const h = (((secondsOfDay / 3600) % 24) + 24) % 24;
  for (let i = 1; i < TRAFFIC_PROFILE.length; i++) {
    const [h1, f1] = TRAFFIC_PROFILE[i];
    const [h0, f0] = TRAFFIC_PROFILE[i - 1];
    if (h <= h1) return f0 + ((f1 - f0) * (h - h0)) / (h1 - h0);
  }
  return 1;
}

/** Matriz estimada: distancia en línea recta × 1,32 por las calles, a 32 km/h con tráfico normal. */
export function estimatedMatrix(points: { lat: number; lng: number }[]) {
  const dist = points.map((a) => points.map((b) => Math.round(haversine(a, b) * 1.32)));
  const dur = dist.map((row) => row.map((d) => (d === 0 ? 0 : Math.round(d / (32 / 3.6) + 60))));
  return { dist, dur };
}
