"use client";

import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { deliverAction, failAction, pickupAction, type DeliverState } from "../../actions";
import { getPosition } from "../../RouteControls";

/** Achica la foto a JPEG (máx. 1600 px) para que suba rápido con poca señal. */
export async function toJpeg(file: File, max = 1600): Promise<Blob> {
  const bmp = await createImageBitmap(file).catch(() => null);
  if (!bmp) return file;
  const s = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * s);
  c.height = Math.round(bmp.height * s);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  return new Promise((r) => c.toBlob((b) => r(b ?? file), "image/jpeg", 0.82));
}

/** Panel de firma con el dedo (o mouse). */
export function SignaturePad({ onChange }: { onChange: (empty: boolean) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const c = ref.current!;
    const resize = () => {
      const r = c.getBoundingClientRect();
      const dpr = Math.min(3, window.devicePixelRatio || 1);
      c.width = Math.round(r.width * dpr);
      c.height = Math.round(r.height * dpr);
      const ctx = c.getContext("2d")!;
      ctx.scale(dpr, dpr);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.lineWidth = 2.6;
      ctx.strokeStyle = "#121212";
      onChange(true);
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [onChange]);

  const pos = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  function down(e: React.PointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    last.current = pos(e);
    const ctx = ref.current!.getContext("2d")!;
    ctx.beginPath();
    ctx.arc(last.current.x, last.current.y, 1.2, 0, Math.PI * 2);
    ctx.fillStyle = "#121212";
    ctx.fill();
  }
  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current || !last.current) return;
    const ctx = ref.current!.getContext("2d")!;
    const p = pos(e);
    // Trazo suave: curva por el punto medio
    const mid = { x: (last.current.x + p.x) / 2, y: (last.current.y + p.y) / 2 };
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.quadraticCurveTo(last.current.x, last.current.y, mid.x, mid.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
    onChange(false);
  }
  function up() {
    drawing.current = false;
    last.current = null;
  }
  function clear() {
    const c = ref.current!;
    c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
    onChange(true);
  }

  return (
    <div className="space-y-1">
      <div className="relative">
        <canvas
          ref={ref}
          id="firma"
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
          className="h-48 w-full touch-none rounded-2xl border-2 border-dashed border-border bg-white"
        />
        <span className="pointer-events-none absolute bottom-10 left-6 right-6 border-b border-border" />
        <span className="pointer-events-none absolute bottom-3 left-6 text-xs text-muted">Firma aquí con el dedo</span>
      </div>
      <button type="button" onClick={clear} className="text-sm font-bold text-muted">Borrar firma</button>
    </div>
  );
}

export function DeliveryForm({ stopId, routeId, defaultName }: { stopId: string; routeId: string; defaultName: string }) {
  const [state, action, pending] = useActionState<DeliverState, FormData>(deliverAction, {});
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [empty, setEmpty] = useState(true);
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [failing, setFailing] = useState(false);

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  async function pickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const jpg = await toJpeg(f);
    setPhoto(jpg);
    setPreview(URL.createObjectURL(jpg));
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLocalError(null);
    if (empty) return setLocalError("Falta la firma de quien recibe.");
    if (!photo) return setLocalError("Toma una foto del producto entregado.");
    setBusy(true);
    const fd = new FormData(e.currentTarget);
    const canvas = document.getElementById("firma") as HTMLCanvasElement;
    const sig = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/png"));
    if (sig) fd.set("signature", new File([sig], "firma.png", { type: "image/png" }));
    fd.set("photo", new File([photo], "foto.jpg", { type: "image/jpeg" }));
    const p = await getPosition(6000);
    if (p) {
      fd.set("lat", String(p.coords.latitude));
      fd.set("lng", String(p.coords.longitude));
      fd.set("accuracy", String(p.coords.accuracy));
    }
    setBusy(false);
    startTransition(() => action(fd));
  }

  async function submitFail(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const p = await getPosition(5000);
    if (p) {
      fd.set("lat", String(p.coords.latitude));
      fd.set("lng", String(p.coords.longitude));
    }
    await failAction(fd);
  }

  const working = busy || pending;

  return (
    <div className="space-y-6">
      <form onSubmit={submit} className="space-y-4">
        <input type="hidden" name="stopId" value={stopId} />
        <input type="hidden" name="routeId" value={routeId} />

        <section className="space-y-2">
          <p className="font-extrabold">1. Foto de la entrega</p>
          <label className="relative flex aspect-[4/3] cursor-pointer flex-col items-center justify-center gap-2 overflow-hidden rounded-2xl border-2 border-dashed border-border bg-surface text-muted">
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt="Foto de la entrega" className="absolute inset-0 h-full w-full object-cover" />
            ) : (
              <>
                <Icon name="camera" className="h-10 w-10" strokeWidth={1.5} />
                <span className="font-bold">Tomar foto</span>
                <span className="text-xs">Que se vea el producto en el lugar</span>
              </>
            )}
            <input type="file" accept="image/*" capture="environment" onChange={pickPhoto} className="sr-only" />
          </label>
          {preview && <p className="text-center text-xs text-muted">Toca la foto para tomar otra.</p>}
        </section>

        <section className="space-y-2">
          <p className="font-extrabold">2. ¿Quién recibe?</p>
          <div className="grid grid-cols-3 gap-2">
            <input name="received_by" defaultValue={defaultName} required placeholder="Nombre" className="col-span-2 rounded-xl border border-border bg-card px-4 py-3" />
            <input name="rut" placeholder="RUT (opcional)" className="rounded-xl border border-border bg-card px-3 py-3" />
          </div>
        </section>

        <section className="space-y-2">
          <p className="font-extrabold">3. Firma</p>
          <SignaturePad onChange={setEmpty} />
        </section>

        {(localError || state.error) && <p className="rounded-xl bg-pass/10 p-3 text-sm font-bold text-pass">{localError ?? state.error}</p>}

        <button disabled={working} className="flex w-full items-center justify-center gap-2 rounded-full bg-brand py-4 text-lg font-extrabold text-white disabled:opacity-60">
          <Icon name="check" className="h-6 w-6" />
          {working ? "Guardando entrega…" : "Confirmar entrega"}
        </button>
        <p className="text-center text-xs text-muted">Se guardan la hora y tu ubicación. El comprador recibe el comprobante en PDF.</p>
      </form>

      <div className="border-t border-border pt-4">
        {!failing ? (
          <button onClick={() => setFailing(true)} className="w-full rounded-full border-2 border-border py-3 font-extrabold text-pass">
            No pude entregar
          </button>
        ) : (
          <form onSubmit={submitFail} className="space-y-2">
            <input type="hidden" name="stopId" value={stopId} />
            <input type="hidden" name="routeId" value={routeId} />
            <p className="font-extrabold">¿Qué pasó?</p>
            <select name="reason" className="w-full rounded-xl border border-border bg-card px-4 py-3">
              <option>No había nadie</option>
              <option>Dirección incorrecta</option>
              <option>No cabe por la puerta o escalera</option>
              <option>El comprador lo rechazó</option>
              <option>Producto dañado en el traslado</option>
              <option>Otro motivo</option>
            </select>
            <button className="w-full rounded-full bg-pass py-3 font-extrabold text-white">Registrar y seguir con la ruta</button>
          </form>
        )}
      </div>
    </div>
  );
}

const PICKUP_FAIL = ["No había nadie", "Dirección incorrecta", "Ya no lo quiere regalar", "No cabe en el vehículo", "Está en muy mal estado", "Otro motivo"];

/**
 * Registrar un retiro: fotos de lo que se recibe (hasta 4) y firma con el dedo
 * de quien lo entrega, aceptando el texto.
 */
export function PickupStopForm({ stopId, routeId, defaultName, terms }: { stopId: string; routeId: string; defaultName: string; terms: string }) {
  const [state, action, pending] = useActionState<DeliverState, FormData>(pickupAction, {});
  const [photos, setPhotos] = useState<{ blob: Blob; url: string }[]>([]);
  const [empty, setEmpty] = useState(true);
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [failing, setFailing] = useState(false);

  useEffect(() => () => photos.forEach((p) => URL.revokeObjectURL(p.url)), [photos]);

  async function addPhotos(e: React.ChangeEvent<HTMLInputElement>) {
    const files = [...(e.target.files ?? [])].slice(0, 4 - photos.length);
    const next = await Promise.all(files.map(async (f) => {
      const blob = await toJpeg(f, 1280);
      return { blob, url: URL.createObjectURL(blob) };
    }));
    setPhotos((p) => [...p, ...next].slice(0, 4));
    e.target.value = "";
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLocalError(null);
    if (!photos.length) return setLocalError("Toma al menos una foto de lo que retiras.");
    if (!accepted) return setLocalError("Quien entrega debe marcar que acepta el texto.");
    if (empty) return setLocalError("Falta la firma de quien regala.");
    setBusy(true);
    const fd = new FormData(e.currentTarget);
    const canvas = document.getElementById("firma") as HTMLCanvasElement;
    const sig = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/png"));
    if (sig) fd.set("signature", new File([sig], "firma.png", { type: "image/png" }));
    fd.delete("photos");
    photos.forEach((p, i) => fd.append("photos", new File([p.blob], `foto-${i + 1}.jpg`, { type: "image/jpeg" })));
    const pos = await getPosition(6000);
    if (pos) {
      fd.set("lat", String(pos.coords.latitude));
      fd.set("lng", String(pos.coords.longitude));
      fd.set("accuracy", String(pos.coords.accuracy));
    }
    setBusy(false);
    startTransition(() => action(fd));
  }

  async function submitFail(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const pos = await getPosition(5000);
    if (pos) {
      fd.set("lat", String(pos.coords.latitude));
      fd.set("lng", String(pos.coords.longitude));
    }
    await failAction(fd);
  }

  const working = busy || pending;

  return (
    <div className="space-y-6">
      <form onSubmit={submit} className="space-y-4">
        <input type="hidden" name="stopId" value={stopId} />
        <input type="hidden" name="routeId" value={routeId} />
        <input type="hidden" name="terms" value={terms} />

        <section className="space-y-2">
          <p className="font-extrabold">1. Fotos de lo que retiras</p>
          <div className="grid grid-cols-2 gap-2">
            {photos.map((p, i) => (
              <div key={p.url} className="relative aspect-square overflow-hidden rounded-2xl bg-surface">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} alt={`Foto ${i + 1}`} className="h-full w-full object-cover" />
                <button type="button" aria-label="Quitar foto" onClick={() => setPhotos((x) => x.filter((_, j) => j !== i))} className="absolute right-2 top-2 rounded-full bg-black/60 p-1 text-white">
                  <Icon name="x" className="h-4 w-4" />
                </button>
              </div>
            ))}
            {photos.length < 4 && (
              <label className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-border bg-surface text-muted">
                <Icon name="camera" className="h-9 w-9" strokeWidth={1.5} />
                <span className="text-sm font-bold">{photos.length ? "Otra foto" : "Tomar foto"}</span>
                <input type="file" accept="image/*" capture="environment" multiple onChange={addPhotos} className="sr-only" />
              </label>
            )}
          </div>
          <p className="text-xs text-muted">Hasta 4 fotos. Que se vea el estado de cada cosa.</p>
        </section>

        <section className="space-y-2">
          <p className="font-extrabold">2. ¿Quién regala?</p>
          <div className="grid grid-cols-3 gap-2">
            <input name="donor_name" defaultValue={defaultName} required placeholder="Nombre" className="col-span-2 rounded-xl border border-border bg-card px-4 py-3" />
            <input name="rut" placeholder="RUT (opcional)" className="rounded-xl border border-border bg-card px-3 py-3" />
          </div>
        </section>

        <section className="space-y-2">
          <p className="font-extrabold">3. Acepta el texto y firma</p>
          <label className="flex cursor-pointer gap-3 rounded-2xl border-2 border-border bg-surface p-3 text-sm">
            <input type="checkbox" name="accept" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--brand)]" />
            <span>{terms}</span>
          </label>
          <SignaturePad onChange={setEmpty} />
        </section>

        {(localError || state.error) && <p className="rounded-xl bg-pass/10 p-3 text-sm font-bold text-pass">{localError ?? state.error}</p>}

        <button disabled={working} className="flex w-full items-center justify-center gap-2 rounded-full bg-brand py-4 text-lg font-extrabold text-white disabled:opacity-60">
          <Icon name="check" className="h-6 w-6" />
          {working ? "Guardando retiro…" : "Confirmar retiro"}
        </button>
        <p className="text-center text-xs text-muted">Se guardan las fotos, la firma, la hora y tu ubicación.</p>
      </form>

      <div className="border-t border-border pt-4">
        {!failing ? (
          <button onClick={() => setFailing(true)} className="w-full rounded-full border-2 border-border py-3 font-extrabold text-pass">
            No pude retirar
          </button>
        ) : (
          <form onSubmit={submitFail} className="space-y-2">
            <input type="hidden" name="stopId" value={stopId} />
            <input type="hidden" name="routeId" value={routeId} />
            <p className="font-extrabold">¿Qué pasó?</p>
            <select name="reason" className="w-full rounded-xl border border-border bg-card px-4 py-3">
              {PICKUP_FAIL.map((r) => <option key={r}>{r}</option>)}
            </select>
            <button className="w-full rounded-full bg-pass py-3 font-extrabold text-white">Registrar y seguir con la ruta</button>
          </form>
        )}
      </div>
    </div>
  );
}
