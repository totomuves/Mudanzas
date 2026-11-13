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

export type OrderStatus = "pending" | "paid" | "failed" | "cancelled";

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
  created_at: string;
  paid_at: string | null;
};
