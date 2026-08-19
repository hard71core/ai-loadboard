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

/** Envelope for GET /api/loads — see backend/app/schemas.py's
PaginatedLoads docstring for the reasoning (page/page_size offset
pagination as the MVP; docs/technical-documentation.html section 8 still
lists cursor pagination as the Phase 2 target). `total`/`total_pages`
reflect whatever `status` filter was applied, same as `items`. Only
LoadsPage.tsx's plain-list browsing view (`!searchActive && !matchesActive`)
paginates — search (`searchLoads`) and matching (`fetchMatches`) results
stay full arrays, unchanged, deliberately out of scope. */
export interface PaginatedLoads {
  items: Load[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
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

/** PATCH /api/auth/me — company_name is the only field a user can
self-edit today (email/role stay fixed post-registration, see the
backend's schemas.UserUpdate docstring). */
export interface ProfileUpdatePayload {
  company_name: string;
}
