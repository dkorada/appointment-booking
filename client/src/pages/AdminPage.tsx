import { AlertTriangle, CalendarCheck, CalendarDays, DollarSign, Inbox, Loader2, Mail, RefreshCw, Search, XCircle } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api, type AdminStats, type Booking, type OutboxEmail } from "../api";
import { formatDateShort, formatDuration, formatPrice, formatTime, zoneLabel } from "../format";
import { useStudio } from "../useStudio";

type Tab = "bookings" | "outbox";

export function AdminPage() {
  const [tab, setTab] = useState<Tab>("bookings");
  const studio = useStudio();

  return (
    <div className="container admin">
      <div className="admin-head">
        <div>
          <p className="eyebrow">Studio dashboard</p>
          <h1 className="h2">{tab === "bookings" ? "Bookings" : "Email outbox"}</h1>
          <p className="muted small">
            Demo admin, no login required.{studio && ` Times in ${zoneLabel(studio.timeZone)}.`}
          </p>
        </div>
        <div className="tabs" role="tablist">
          <button role="tab" aria-selected={tab === "bookings"} className={`tab ${tab === "bookings" ? "is-active" : ""}`} onClick={() => setTab("bookings")}>
            <CalendarDays size={16} /> Bookings
          </button>
          <button role="tab" aria-selected={tab === "outbox"} className={`tab ${tab === "outbox" ? "is-active" : ""}`} onClick={() => setTab("outbox")}>
            <Inbox size={16} /> Email outbox
          </button>
        </div>
      </div>
      {tab === "bookings" ? <BookingsTab timeZone={studio?.timeZone} /> : <OutboxTab />}
    </div>
  );
}

function BookingsTab({ timeZone }: { timeZone?: string }) {
  const [range, setRange] = useState("upcoming");
  const [status, setStatus] = useState("ALL");
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [data, setData] = useState<{ bookings: Booking[]; stats: AdminStats } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toCancel, setToCancel] = useState<Booking | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 250);
    return () => clearTimeout(t);
  }, [query]);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    return api
      .adminBookings({ range, status, q: debounced })
      .then(setData)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [range, status, debounced]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const stats = data?.stats;
  const tz = timeZone ?? "UTC";

  return (
    <>
      <div className="stats">
        <Stat icon={<CalendarCheck size={18} />} label="Today" value={stats?.today} />
        <Stat icon={<CalendarDays size={18} />} label="Upcoming" value={stats?.upcoming} />
        <Stat icon={<DollarSign size={18} />} label="Upcoming revenue" value={stats && formatPrice(stats.upcomingRevenueCents)} />
        <Stat icon={<XCircle size={18} />} label="Cancelled" value={stats?.cancelled} />
        <Stat icon={<Mail size={18} />} label="Emails sent" value={stats?.emailsSent} />
      </div>

      <div className="toolbar">
        <div className="segmented" role="radiogroup" aria-label="Date range">
          {[
            ["upcoming", "Upcoming"],
            ["past", "Past"],
            ["all", "All"],
          ].map(([v, l]) => (
            <button key={v} role="radio" aria-checked={range === v} className={range === v ? "is-active" : ""} onClick={() => setRange(v)}>
              {l}
            </button>
          ))}
        </div>
        <select className="select" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
          <option value="ALL">All statuses</option>
          <option value="CONFIRMED">Confirmed</option>
          <option value="CANCELLED">Cancelled</option>
        </select>
        <label className="search">
          <Search size={16} aria-hidden />
          <input
            type="search"
            placeholder="Search name, email, phone or reference"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search bookings"
          />
        </label>
        <button className="icon-btn" onClick={load} aria-label="Refresh" title="Refresh">
          <RefreshCw size={16} className={loading ? "spin" : ""} />
        </button>
      </div>

      {error && (
        <div className="alert alert-error" role="alert">
          <AlertTriangle size={18} /> {error}
        </div>
      )}

      <div className="table-card">
        <table className="table">
          <thead>
            <tr>
              <th>When</th>
              <th>Customer</th>
              <th>Service</th>
              <th>Reference</th>
              <th>Status</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {!data &&
              loading &&
              Array.from({ length: 5 }, (_, i) => (
                <tr key={i}>
                  <td colSpan={6}>
                    <div className="skeleton" style={{ height: 22 }} />
                  </td>
                </tr>
              ))}
            {data?.bookings.length === 0 && (
              <tr>
                <td colSpan={6} className="table-empty">
                  No bookings match these filters.
                </td>
              </tr>
            )}
            {data?.bookings.map((b) => (
              <tr key={b.id} className={b.status === "CANCELLED" ? "is-cancelled" : ""}>
                <td data-label="When">
                  <span className="cell-strong">{formatDateShort(b.startAt, tz)}</span>
                  <span className="cell-sub">
                    {formatTime(b.startAt, tz)} – {formatTime(b.endAt, tz)}
                  </span>
                </td>
                <td data-label="Customer">
                  <span className="cell-strong">{b.customerName}</span>
                  <span className="cell-sub">{b.email}</span>
                  <span className="cell-sub">{b.phone}</span>
                  {b.notes && <span className="cell-note">“{b.notes}”</span>}
                </td>
                <td data-label="Service">
                  <span className="cell-strong">{b.service.name}</span>
                  <span className="cell-sub">
                    {formatDuration(b.service.durationMin)} · {formatPrice(b.service.priceCents)}
                  </span>
                </td>
                <td data-label="Reference">
                  <Link to={`/booking/${b.reference}`} className="mono link">
                    {b.reference}
                  </Link>
                </td>
                <td data-label="Status">
                  <span className={`pill ${b.status === "CONFIRMED" ? "pill-green" : "pill-gray"}`}>
                    {b.status === "CONFIRMED" ? "Confirmed" : "Cancelled"}
                  </span>
                </td>
                <td className="cell-actions">
                  {b.status === "CONFIRMED" && new Date(b.endAt) > new Date() && (
                    <button className="btn btn-danger-ghost btn-sm" onClick={() => setToCancel(b)}>
                      Cancel
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {toCancel && (
        <CancelDialog
          booking={toCancel}
          timeZone={tz}
          onClose={() => setToCancel(null)}
          onCancelled={(b) => {
            setToCancel(null);
            setToast(`Booking ${b.reference} cancelled. A cancellation email was sent to ${b.email}.`);
            load();
          }}
        />
      )}

      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </>
  );
}

function CancelDialog({
  booking,
  timeZone,
  onClose,
  onCancelled,
}: {
  booking: Booking;
  timeZone: string;
  onClose: () => void;
  onCancelled: (b: Booking) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      onCancelled(await api.cancelBooking(booking.id));
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <dialog ref={ref} className="dialog" onClose={onClose} onClick={(e) => e.target === ref.current && onClose()}>
      <div className="dialog-body">
        <div className="dialog-icon">
          <AlertTriangle size={22} />
        </div>
        <h2 className="h3">Cancel this booking?</h2>
        <p className="muted">
          {booking.customerName}'s {booking.service.name} on {formatDateShort(booking.startAt, timeZone)} at{" "}
          {formatTime(booking.startAt, timeZone)} will be cancelled, the time slot freed up, and a cancellation email sent.
        </p>
        {error && <p className="field-error">{error}</p>}
        <div className="dialog-actions">
          <button className="btn btn-ghost" onClick={onClose} disabled={busy}>
            Keep booking
          </button>
          <button className="btn btn-danger" onClick={confirm} disabled={busy} autoFocus>
            {busy && <Loader2 size={16} className="spin" />} Cancel booking
          </button>
        </div>
      </div>
    </dialog>
  );
}

function OutboxTab() {
  const [emails, setEmails] = useState<OutboxEmail[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    api
      .outbox()
      .then(setEmails)
      .catch((e: Error) => setError(e.message));
  }, []);

  return (
    <div className="outbox">
      <p className="muted small">
        Emails are mocked: each one is printed to the server console and saved here instead of being sent.
      </p>
      {error && <div className="alert alert-error">{error}</div>}
      {!emails && !error && <div className="table-card skeleton" style={{ height: 240 }} />}
      {emails?.length === 0 && <div className="empty">No emails yet.</div>}
      <ul className="mail-list">
        {emails?.map((m) => (
          <li key={m.id} className={`mail ${open === m.id ? "is-open" : ""}`}>
            <button className="mail-head" onClick={() => setOpen(open === m.id ? null : m.id)} aria-expanded={open === m.id}>
              <span className={`pill ${m.type === "BOOKING_CONFIRMED" ? "pill-green" : "pill-rose"}`}>
                {m.type === "BOOKING_CONFIRMED" ? "Confirmation" : "Cancellation"}
              </span>
              <span className="mail-subject">{m.subject}</span>
              <span className="mail-to">{m.to}</span>
              <span className="mail-time">
                {new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(m.createdAt))}
              </span>
            </button>
            {open === m.id && <pre className="mail-body">{m.bodyText}</pre>}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value?: React.ReactNode }) {
  return (
    <div className="stat">
      <span className="stat-icon">{icon}</span>
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value ?? <span className="skeleton skeleton-text" />}</span>
    </div>
  );
}
