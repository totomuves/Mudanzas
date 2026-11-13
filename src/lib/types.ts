export type Category = {
  slug: string;
  name: string;
  emoji: string;
  sort_order: number;
};

export type Condition = "nuevo" | "como_nuevo" | "buen_estado" | "con_detalles";
export type ProductStatus = "available" | "reserved" | "sold" | "hidden";

export type Product = {
  id: string;
  title: string;
  description: string;
  category_slug: string;
  price: number;
  original_price: number | null;
  condition: Condition;
  comuna: string | null;
  images: string[];
  quantity: number;
  /** Vendedor dueño del producto (null = Totomuves). Nunca se muestra al público. */
  seller_id?: string | null;
  /** Unidades comprables ahora (stock menos pagos en curso). Solo si se pide en el select. */
  available_units?: number;
  status: ProductStatus;
  flash_price: number | null;
  flash_until: string | null;
  reserved_by: string | null;
  reserved_until: string | null;
  sold_at: string | null;
  created_at: string;
  updated_at: string;
};

export type Profile = {
  id: string;
  display_name: string | null;
  comuna: string | null;
  budget_max: number | null;
  onboarded: boolean;
  is_admin: boolean;
};

export type UserCategory = {
  category_slug: string;
  weight: number;
  selected: boolean;
};

export type SwipeAction = "like" | "pass" | "superlike";

export type OrderStatus = "pending" | "paid" | "failed" | "cancelled" | "refunded";

export type Order = {
  id: string;
  user_id: string | null;
  product_id: string;
  amount: number;
  quantity: number;
  reserved_until: string | null;
  status: OrderStatus;
  buyer_name: string;
  buyer_email: string;
  buyer_phone: string | null;
  delivery: "retiro" | "despacho";
  address: string | null;
  mp_preference_id: string | null;
  mp_payment_id: string | null;
  seller_id?: string | null;
  commission_amount?: number | null;
  delivered_at?: string | null;
  release_at?: string | null;
  confirmed_at?: string | null;
  issue_at?: string | null;
  issue_text?: string | null;
  released_at?: string | null;
  refunded_at?: string | null;
  payout_at?: string | null;
  created_at: string;
  paid_at: string | null;
};

export type SellerStatus = "pending" | "approved" | "rejected" | "suspended";

export type Seller = {
  id: string;
  owner_id: string;
  name: string;
  kind: "empresa" | "persona";
  rut: string | null;
  contact_name: string | null;
  email: string;
  phone: string;
  comunas: string[];
  description: string;
  logo_url: string | null;
  status: SellerStatus;
  commission_pct: number | null;
  admin_note: string | null;
  approved_at: string | null;
  bank_name: string | null;
  bank_account_type: "corriente" | "vista" | "ahorro" | "rut" | null;
  bank_account_number: string | null;
  bank_holder_name: string | null;
  bank_holder_rut: string | null;
  created_at: string;
  updated_at: string;
};

export type MarketplaceSettings = { id: 1; commission_pct: number; review_days: number; updated_at: string };

export type BannerStyle = "suave" | "marca" | "oscuro";

export type HomeBanner = {
  id: string;
  eyebrow: string | null;
  title: string;
  subtitle: string | null;
  cta_label: string;
  href: string;
  image_url: string | null;
  style: BannerStyle;
  sort_order: number;
  active: boolean;
  created_at: string;
  updated_at: string;
};
