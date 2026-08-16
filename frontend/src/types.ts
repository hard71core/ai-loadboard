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
  accepted_at: string | null;
}

/** GET /api/loads/:id/eta — see backend/app/core/eta.py for how these
numbers are derived. distance_miles/drive_hours_* are null when live
routing data couldn't be fetched at all; eta_earliest/eta_latest are
additionally null whenever the load hasn't been accepted yet. */
export interface LoadETA {
  load_id: number;
  status: LoadStatus;
  model_version: string;
  basis: string;
  distance_miles: number | null;
  drive_hours_min: number | null;
  drive_hours_max: number | null;
  eta_earliest: string | null;
  eta_latest: string | null;
}

export interface LoadCreatePayload {
  title: string;
  origin: string;
  destination: string;
  equipment_type: string;
  weight_lbs: number;
  price_usd: number;
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
  refresh_token: string;
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
