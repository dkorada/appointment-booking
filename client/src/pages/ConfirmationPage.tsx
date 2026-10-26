import { CalendarPlus, Check, Copy, Mail, MapPin, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { api, type Booking } from "../api";
import { formatDateLong, formatDuration, formatPrice, formatTime, zoneLabel } from "../format";
import { useStudio } from "../useStudio";

const icsDate = (iso: string) => iso.replace(/[-:]/g, "").replace(/\.\d{3}/, "");

function downloadIcs(b: Booking) {
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Glow Studio//Booking//EN",
    "BEGIN:VEVENT",
    `UID:${b.reference}@glowstudio.example`,
    `DTSTAMP:${icsDate(new Date().toISOString())}`,
    `DTSTART:${icsDate(b.startAt)}`,
    `DTEND:${icsDate(b.endAt)}`,
    `SUMMARY:${b.service.name} at Glow Studio`,
    `DESCRIPTION:Booking reference ${b.reference}`,
    "LOCATION:214 Mercer Street\\, New York\\, NY 10012",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `glow-studio-${b.reference}.ics`;
  a.click();
  URL.revokeObjectURL(url);
}

export function ConfirmationPage() {
  const { reference = "" } = useParams();
  const location = useLocation();
  const studio = useStudio();
  const state = location.state as { booking?: Booking; justBooked?: boolean } | null;

  const [booking, setBooking] = useState<Booking | null>(state?.booking ?? null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (booking?.reference === reference) return;
    api
      .booking(reference)
      .then(setBooking)
      .catch((e: Error) => setError(e.message));
  }, [reference, booking]);

  if (error) {
    return (
      <div className="container narrow">
        <div className="card center">
          <XCircle size={40} className="icon-muted" />
          <h1 className="h2">Booking not found</h1>
          <p className="muted">{error}</p>
          <Link to="/" className="btn btn-primary">
            Book an appointment
          </Link>
        </div>
      </div>
    );
  }

  if (!booking || !studio) {
    return (
      <div className="container narrow">
        <div className="card skeleton" style={{ height: 420 }} />
      </div>
    );
  }

  const cancelled = booking.status === "CANCELLED";
  const tz = studio.timeZone;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(booking.reference);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <div className="container narrow">
      <div className="card confirmation">
        <div className={`confirm-badge ${cancelled ? "is-cancelled" : ""}`} aria-hidden>
          {cancelled ? <XCircle size={30} /> : <Check size={30} strokeWidth={3} />}
        </div>
        <h1 className="h2">{cancelled ? "This booking was cancelled" : state?.justBooked ? "You're booked!" : "Your booking"}</h1>
        <p className="muted">
          {cancelled
            ? "This appointment is no longer active. We'd love to see you another time."
            : `Thanks, ${booking.customerName.split(" ")[0]}. We can't wait to see you.`}
        </p>

        <div className="reference">
          <span className="reference-label">Booking reference</span>
          <span className="reference-code">{booking.reference}</span>
          <button type="button" className="btn btn-soft btn-sm" onClick={copy}>
            {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "Copied" : "Copy"}
          </button>
        </div>

        <dl className="detail-list">
          <div>
            <dt>Service</dt>
            <dd>
              {booking.service.name} <span className="muted">· {formatDuration(booking.service.durationMin)}</span>
            </dd>
          </div>
          <div>
            <dt>Date</dt>
            <dd>{formatDateLong(booking.startAt, tz)}</dd>
          </div>
          <div>
            <dt>Time</dt>
            <dd>
              {formatTime(booking.startAt, tz)} – {formatTime(booking.endAt, tz)}{" "}
              <span className="muted">{zoneLabel(tz)}</span>
            </dd>
          </div>
          <div>
            <dt>Price</dt>
            <dd>{formatPrice(booking.service.priceCents)} · pay at the studio</dd>
          </div>
          <div>
            <dt>Where</dt>
            <dd>
              <MapPin size={14} className="inline-icon" aria-hidden /> 214 Mercer Street, New York, NY 10012
            </dd>
          </div>
        </dl>

        {!cancelled && (
          <p className="notice">
            <Mail size={16} aria-hidden />
            <span>
              A confirmation email has been sent to <strong>{booking.email}</strong>.
            </span>
          </p>
        )}

        <div className="confirm-actions">
          {!cancelled && (
            <button type="button" className="btn btn-soft" onClick={() => downloadIcs(booking)}>
              <CalendarPlus size={16} /> Add to calendar
            </button>
          )}
          <Link to="/" className="btn btn-primary">
            Book another appointment
          </Link>
        </div>
      </div>
    </div>
  );
}
