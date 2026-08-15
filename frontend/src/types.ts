export type LoadStatus = "open" | "accepted" | "completed";

export interface Load {
  id: number;
  title: string;
  origin: string;
  destination: string;
  equipment_type: string;
  weight_lbs: number;
  price_usd: number;
  shipper_name: string;
  carrier_name: string | null;
  status: LoadStatus;
  created_at: string;
}

export interface LoadCreatePayload {
  title: string;
  origin: string;
  destination: string;
  equipment_type: string;
  weight_lbs: number;
  price_usd: number;
  shipper_name: string;
}

export type UserRole = "shipper" | "carrier";

export interface User {
  id: number;
  email: string;
  company_name: string;
  role: UserRole;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  user: User;
}

export interface RegisterPayload {
  email: string;
  password: string;
  company_name: string;
  role: UserRole;
}

export interface LoginPayload {
  email: string;
  password: string;
}
