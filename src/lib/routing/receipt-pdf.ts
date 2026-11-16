import "server-only";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import { brand } from "@/brand";
import { formatCLP } from "@/lib/format";
import { TZ, formatDeliveryDate, formatTime } from "@/lib/delivery";

export type ReceiptData = {
  code: string;
  orderId: string;
  product: string;
  quantity: number;
  amount: number;
  buyerName: string;
  buyerEmail: string;
  address: string;
  deliveredAt: string;
  deliveryDate: string;
  windowStart: string | null;
  windowEnd: string | null;
  receivedBy: string;
  receiverRut: string | null;
  lat: number | null;
  lng: number | null;
  accuracy: number | null;
  vehicle: string | null;
  signature: Uint8Array | null;
  signatureType: string | null;
  photo: Uint8Array | null;
  photoType: string | null;
  verifyUrl: string;
};

const BRAND = rgb(0x5b / 255, 0x3f / 255, 0xe0 / 255);
const PINK = rgb(0xe0 / 255, 0x60 / 255, 0x9a / 255);
const TEXT = rgb(0.07, 0.07, 0.07);
const MUTED = rgb(0.39, 0.39, 0.39);
const LINE = rgb(0.91, 0.9, 0.93);

/** Helvetica solo dibuja caracteres latinos: se limpian los demás. */
const safe = (s: string) => s.replace(/[^\x20-\x7E -ÿ]/g, "");

/** Comprobante de entrega en PDF (carta), con firma y foto. */
export async function buildReceiptPdf(d: ReceiptData) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Comprobante de entrega ${d.code}`);
  pdf.setAuthor(brand.name);
  pdf.setCreator(brand.name);
  const page = pdf.addPage([612, 792]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const W = 612, M = 48;

  // Encabezado con franja de color de la marca
  page.drawRectangle({ x: 0, y: 742, width: W, height: 50, color: BRAND });
  page.drawRectangle({ x: W * 0.62, y: 742, width: W * 0.38, height: 50, color: PINK, opacity: 0.55 });
  page.drawText(brand.name, { x: M, y: 760, size: 22, font: bold, color: rgb(1, 1, 1) });
  page.drawText("Comprobante de entrega", { x: W - M - bold.widthOfTextAtSize("Comprobante de entrega", 13), y: 762, size: 13, font: bold, color: rgb(1, 1, 1) });

  let y = 710;
  page.drawText(`Código ${d.code}`, { x: M, y, size: 18, font: bold, color: TEXT });
  const issued = `Pedido #${d.orderId.slice(0, 8)}`;
  page.drawText(issued, { x: W - M - font.widthOfTextAtSize(issued, 10), y: y + 4, size: 10, font, color: MUTED });
  y -= 30;

  const deliveredDate = new Date(d.deliveredAt);
  const fecha = new Intl.DateTimeFormat("es-CL", { timeZone: TZ, weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(deliveredDate);

  y = section(page, bold, "Pedido", y, M);
  y = row(page, font, bold, "Producto", `${d.product}${d.quantity > 1 ? ` x ${d.quantity}` : ""}`, y, M);
  y = row(page, font, bold, "Total pagado", formatCLP(d.amount), y, M);
  y = row(page, font, bold, "Comprador", `${d.buyerName} · ${d.buyerEmail}`, y, M);
  y = row(page, font, bold, "Dirección", d.address, y, M);
  y -= 8;

  y = section(page, bold, "Entrega", y, M);
  y = row(page, font, bold, "Fecha y hora", `${fecha}, ${formatTime(deliveredDate)} h`, y, M);
  if (d.windowStart && d.windowEnd) {
    y = row(page, font, bold, "Ventana avisada", `${formatDeliveryDate(d.deliveryDate)}, ${formatTime(d.windowStart)} a ${formatTime(d.windowEnd)}`, y, M);
  }
  y = row(page, font, bold, "Recibió", `${d.receivedBy}${d.receiverRut ? ` · RUT ${d.receiverRut}` : ""}`, y, M);
  if (d.lat != null && d.lng != null) {
    y = row(page, font, bold, "Ubicación", `${d.lat.toFixed(5)}, ${d.lng.toFixed(5)}${d.accuracy ? ` (precisión ${d.accuracy} m)` : ""}`, y, M);
  }
  if (d.vehicle) y = row(page, font, bold, "Vehículo", d.vehicle, y, M);
  y -= 12;

  // Foto y firma lado a lado
  const boxW = (W - M * 2 - 20) / 2, boxH = 230;
  const top = y;
  page.drawText("Foto de la entrega", { x: M, y: top, size: 10, font: bold, color: MUTED });
  page.drawText("Firma de quien recibe", { x: M + boxW + 20, y: top, size: 10, font: bold, color: MUTED });
  const boxY = top - 8 - boxH;
  for (const x of [M, M + boxW + 20]) page.drawRectangle({ x, y: boxY, width: boxW, height: boxH, borderColor: LINE, borderWidth: 1 });
  const photo = await embed(pdf, d.photo, d.photoType);
  const sig = await embed(pdf, d.signature, d.signatureType);
  if (photo) fit(page, photo, M, boxY, boxW, boxH, 6);
  else page.drawText("Sin foto", { x: M + boxW / 2 - 18, y: boxY + boxH / 2, size: 10, font, color: MUTED });
  if (sig) fit(page, sig, M + boxW + 20, boxY, boxW, boxH, 16);
  page.drawLine({ start: { x: M + boxW + 40, y: boxY + 40 }, end: { x: M + boxW * 2, y: boxY + 40 }, thickness: 0.6, color: LINE });
  page.drawText(safe(d.receivedBy), { x: M + boxW + 40, y: boxY + 26, size: 9, font, color: MUTED });

  // Pie
  const foot = `Verifica este comprobante en ${d.verifyUrl}`;
  page.drawLine({ start: { x: M, y: 70 }, end: { x: W - M, y: 70 }, thickness: 0.6, color: LINE });
  page.drawText(safe(foot), { x: M, y: 54, size: 8.5, font, color: MUTED });
  const now = new Date();
  page.drawText(safe(`Documento generado por ${brand.name} el ${new Intl.DateTimeFormat("es-CL", { timeZone: TZ, dateStyle: "short" }).format(now)} a las ${formatTime(now)} h`), { x: M, y: 42, size: 8.5, font, color: MUTED });

  return pdf.save();
}

function section(page: PDFPage, bold: PDFFont, title: string, y: number, M: number) {
  page.drawText(title.toUpperCase(), { x: M, y, size: 9, font: bold, color: BRAND });
  page.drawLine({ start: { x: M, y: y - 5 }, end: { x: 612 - M, y: y - 5 }, thickness: 0.6, color: LINE });
  return y - 22;
}

function row(page: PDFPage, font: PDFFont, bold: PDFFont, label: string, value: string, y: number, M: number) {
  page.drawText(label, { x: M, y, size: 10, font: bold, color: MUTED });
  const lines = wrap(safe(value), font, 10, 612 - M * 2 - 130);
  lines.forEach((l, i) => page.drawText(l, { x: M + 130, y: y - i * 13, size: 10, font, color: TEXT }));
  return y - Math.max(1, lines.length) * 13 - 6;
}

function wrap(text: string, font: PDFFont, size: number, max: number) {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const t = cur ? `${cur} ${w}` : w;
    if (font.widthOfTextAtSize(t, size) > max && cur) {
      lines.push(cur);
      cur = w;
    } else cur = t;
  }
  if (cur) lines.push(cur);
  return lines.slice(0, 4);
}

async function embed(pdf: PDFDocument, bytes: Uint8Array | null, type: string | null): Promise<PDFImage | null> {
  if (!bytes || !bytes.length) return null;
  try {
    if (type?.includes("png") || (bytes[0] === 0x89 && bytes[1] === 0x50)) return await pdf.embedPng(bytes);
    if (type?.includes("jp") || (bytes[0] === 0xff && bytes[1] === 0xd8)) return await pdf.embedJpg(bytes);
  } catch (e) {
    console.warn("[comprobante] imagen", e);
  }
  return null;
}

function fit(page: PDFPage, img: PDFImage, x: number, y: number, w: number, h: number, pad: number) {
  const s = Math.min((w - pad * 2) / img.width, (h - pad * 2) / img.height);
  const iw = img.width * s, ih = img.height * s;
  page.drawImage(img, { x: x + (w - iw) / 2, y: y + (h - ih) / 2, width: iw, height: ih });
}
