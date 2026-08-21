export const WORKER_PUBLIC_PATHS = Object.freeze([
  "/payment/*",
  "/p/*",
  "/api/paypal/*",
  "/assets/*",
  "/__csp-report",
  "/__client-error",
  "/__diag"
]);

export const WORKER_ADMIN_PATHS = Object.freeze([
  "/api/admin/*",
  "/admin/*"
]);

export const WORKER_ROUTE_DOMAINS = Object.freeze([
  "fishing.nice.okinawa",
  "activity.nice.okinawa"
]);
