import type { LoadStatus, UserRole } from "./types";

export const STATUS_LABEL: Record<LoadStatus, string> = {
  open: "Open",
  accepted: "Accepted",
  completed: "Completed",
};

export const ROLE_LABEL: Record<UserRole, string> = {
  shipper: "Shipper",
  carrier: "Carrier",
};
