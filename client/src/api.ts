import type { CreateBookingInput, FieldErrors } from "../../shared/booking";

export interface Service {
  id: string;
  slug: string;
  name: string;
  description: string;
  durationMin: number;
  priceCents: number;
  category: string;
}

export interface StudioInfo {
  name: string;
  timeZone: string;
  hours: { open: string; close: string; lunchStart: string; lunchEnd: string };
  closedWeekdays: number[];
  maxDaysAhead: number;
  today: string;
}

export interface Slot {
  startAt: string;
  endAt: string;
  label: string;
}

export interface Availability {
  date: string;
  timeZone: string;
  closedReason?: "CLOSED_DAY" | "PAST_DATE" | "TOO_FAR_AHEAD";
  slots: Slot[];
}

type ServiceSummary = Pick<Service, "name" | "durationMin" | "priceCents" | "category">;

export interface Booking {
  id: string;
  reference: string;
  startAt: string;
  endAt: string;
  customerName: string;
  phone?: string;
  email: string;
  notes?: string | null;
  status: "CONFIRMED" | "CANCELLED";
  cancelledAt?: string | null;
  createdAt?: string;
  service: ServiceSummary;
}

export interface AdminStats {
  upcoming: number;
  today: number;
  upcomingRevenueCents: number;
  cancelled: number;
  emailsSent: number;
}

export interface OutboxEmail {
  id: string;
  type: "BOOKING_CONFIRMED" | "BOOKING_CANCELLED";
  to: string;
  subject: string;
  bodyText: string;
  createdAt: string;
  booking: { reference: string } | null;
}

export class ApiRequestError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public fieldErrors?: FieldErrors,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...init?.headers },
    });
  } catch {
    throw new ApiRequestError(0, "NETWORK", "Can't reach the server. Check your connection and try again.");
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const e = body?.error;
    throw new ApiRequestError(res.status, e?.code ?? "UNKNOWN", e?.message ?? "Something went wrong", e?.fieldErrors);
  }
  return body as T;
}

export const api = {
  config: () => request<StudioInfo>("/config"),
  services: () => request<Service[]>("/services"),
  availability: (serviceId: string, date: string) =>
    request<Availability>(`/availability?serviceId=${encodeURIComponent(serviceId)}&date=${date}`),
  createBooking: (input: CreateBookingInput) =>
    request<Booking>("/bookings", { method: "POST", body: JSON.stringify(input) }),
  booking: (reference: string) => request<Booking>(`/bookings/${encodeURIComponent(reference)}`),
  adminBookings: (params: { range: string; status: string; q: string }) =>
    request<{ bookings: Booking[]; stats: AdminStats }>(`/admin/bookings?${new URLSearchParams(params)}`),
  cancelBooking: (id: string) => request<Booking>(`/admin/bookings/${id}/cancel`, { method: "POST" }),
  outbox: () => request<OutboxEmail[]>("/admin/outbox"),
};
