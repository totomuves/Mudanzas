/**
 * ÍCONOS
 * Íconos de línea de https://lucide.dev (reemplazan los emojis en toda la app).
 * Uso: <Icon name="home" className="h-6 w-6" />
 * Para agregar uno: búscalo en lucide.dev, impórtalo aquí y súmalo a ICONS.
 */
import {
  ArrowDown, ArrowLeft, Bell, BellOff, ArrowRight, ArrowUp, Baby, BadgeCheck, Bike, BookOpen, Box, Briefcase, Building2,
  Calculator, CalendarDays, Camera, Check, CircleCheck, CircleX, Clock, Crown, Dumbbell, Flag, Gift, Heart,
  House, Image as ImageIcon, ImagePlus, Images, Lamp, Laptop, LayoutGrid, Lock, LogIn, Mail, MapPin, Microwave,
  MoveRight, Navigation, NotebookPen, Package, PackageOpen, PartyPopper, PawPrint, Phone, Piano, Plug, RotateCcw,
  RotateCw, Search, Shirt, ShoppingBag, Sofa, Sparkles, Star, Store, Telescope, ThumbsUp, Trash2, Trophy, Truck,
  User, Users, UtensilsCrossed, Wand2, Warehouse, Wrench, X, Zap, BedDouble, Hammer, Frown, Rocket, Sprout,
  type LucideIcon,
} from "lucide-react";

const ICONS = {
  // navegación
  home: House, cards: Images, truck: Truck, heart: Heart, sparkle: Sparkles, search: Search, grid: LayoutGrid,
  arrow: ArrowRight, back: ArrowLeft, up: ArrowUp, down: ArrowDown, user: User, users: Users, login: LogIn,
  // acciones
  check: Check, x: X, star: Star, undo: RotateCcw, rotate: RotateCw, trash: Trash2, camera: Camera,
  image: ImageIcon, imagePlus: ImagePlus, wand: Wand2, zap: Zap, lock: Lock, mail: Mail, phone: Phone,
  // datos
  pin: MapPin, flag: Flag, calendar: CalendarDays, clock: Clock, note: NotebookPen, box: Package,
  boxOpen: PackageOpen, piano: Piano, calculator: Calculator, gift: Gift, store: Store, bag: ShoppingBag,
  route: MoveRight, navigation: Navigation, warehouse: Warehouse, tools: Wrench, hammer: Hammer,
  // estados
  bell: Bell, bellOff: BellOff,
  ok: CircleCheck, fail: CircleX, verified: BadgeCheck, party: PartyPopper, sad: Frown, like: ThumbsUp,
  // niveles
  sprout: Sprout, telescope: Telescope, rocket: Rocket, trophy: Trophy, crown: Crown,
  // categorías y servicios
  sofa: Sofa, kitchen: UtensilsCrossed, plug: Plug, laptop: Laptop, bed: BedDouble, lamp: Lamp, baby: Baby,
  bike: Bike, book: BookOpen, shirt: Shirt, paw: PawPrint, dumbbell: Dumbbell, microwave: Microwave,
  building: Building2, briefcase: Briefcase,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof ICONS;

export function Icon({
  name,
  className = "h-5 w-5",
  strokeWidth = 1.8,
  fill,
}: {
  name: IconName;
  className?: string;
  strokeWidth?: number;
  fill?: string;
}) {
  const C = ICONS[name] ?? Box;
  return <C className={`shrink-0 ${className}`} strokeWidth={strokeWidth} fill={fill ?? "none"} aria-hidden />;
}

/** Ícono de cada categoría según su slug (las categorías nuevas usan una caja). */
const CATEGORY_ICONS: Record<string, IconName> = {
  muebles: "sofa", living: "sofa", comedor: "kitchen", cocina: "kitchen", electro: "plug", tecnologia: "laptop",
  dormitorio: "bed", deco: "lamp", ninos: "baby", deporte: "bike", libros: "book", herramientas: "tools",
  ropa: "shirt", mascotas: "paw",
};

export function CategoryIcon({ slug, className = "h-6 w-6", strokeWidth = 1.6 }: { slug: string; className?: string; strokeWidth?: number }) {
  return <Icon name={CATEGORY_ICONS[slug] ?? "box"} className={className} strokeWidth={strokeWidth} />;
}

/** Ícono de cada tipo de mudanza según su slug. */
const SERVICE_ICONS: Record<string, IconName> = {
  flete: "truck", "depto-chico": "building", "casa-mediana": "home", "casa-grande": "home", oficina: "briefcase",
};

export function ServiceIcon({ slug, className = "h-6 w-6" }: { slug: string; className?: string }) {
  return <Icon name={SERVICE_ICONS[slug] ?? "truck"} className={className} strokeWidth={1.6} />;
}
