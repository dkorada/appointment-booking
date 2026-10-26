import { AlertCircle, ArrowLeft, ArrowRight, Check, Clock, Loader2, Sparkles } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { createBookingSchema, customerSchema, toFieldErrors, type BookingField, type FieldErrors } from "../../../shared/booking";
import { api, ApiRequestError, type Availability, type Service, type Slot } from "../api";
import { Calendar, firstOpenDay, isOpenDay, nextDay } from "../components/Calendar";
import { formatClockLabel, formatDuration, formatPrice, formatYmd, zoneLabel } from "../format";
import { useStudio } from "../useStudio";

type Step = 1 | 2 | 3;
type CustomerField = "customerName" | "phone" | "email" | "notes";

const STEPS: Array<{ n: Step; label: string }> = [
  { n: 1, label: "Service" },
  { n: 2, label: "Date & time" },
  { n: 3, label: "Your details" },
];

const EMPTY_FORM: Record<CustomerField, string> = { customerName: "", phone: "", email: "", notes: "" };

export function BookingPage() {
  const navigate = useNavigate();
  const studio = useStudio();

  const [services, setServices] = useState<Service[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [category, setCategory] = useState("All");

  const [step, setStep] = useState<Step>(1);
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [availability, setAvailability] = useState<Availability | null>(null);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsError, setSlotsError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [form, setForm] = useState(EMPTY_FORM);
  const [touched, setTouched] = useState<Partial<Record<CustomerField, boolean>>>({});
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [serverErrors, setServerErrors] = useState<FieldErrors>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const service = services?.find((s) => s.id === serviceId) ?? null;

  useEffect(() => {
    api
      .services()
      .then(setServices)
      .catch((e: Error) => setLoadError(e.message));
  }, []);

  const stepperRef = useRef<HTMLOListElement>(null);
  useEffect(() => {
    const el = stepperRef.current;
    if (el && el.getBoundingClientRect().top < 64) {
      window.scrollTo({ top: el.offsetTop - 84, behavior: "smooth" });
    }
  }, [step]);

  useEffect(() => {
    if (studio && !date) setDate(firstOpenDay(studio.today, studio.maxDaysAhead, studio.closedWeekdays));
  }, [studio, date]);

  useEffect(() => {
    if (!serviceId || !date) return;
    let alive = true;
    setSlotsLoading(true);
    setSlotsError(null);
    api
      .availability(serviceId, date)
      .then((a) => alive && setAvailability(a))
      .catch((e: Error) => alive && setSlotsError(e.message))
      .finally(() => alive && setSlotsLoading(false));
    return () => {
      alive = false;
    };
  }, [serviceId, date, reloadKey]);

  const categories = useMemo(() => ["All", ...new Set(services?.map((s) => s.category) ?? [])], [services]);
  const visibleServices = services?.filter((s) => category === "All" || s.category === category) ?? [];

  const clientErrors = useMemo(() => {
    const r = customerSchema.safeParse(form);
    return r.success ? {} : toFieldErrors(r.error);
  }, [form]);

  const fieldError = (f: CustomerField) =>
    touched[f] || submitAttempted ? (clientErrors[f] ?? serverErrors[f]) : serverErrors[f];

  const chooseService = (id: string) => {
    if (id !== serviceId) {
      setSlot(null);
      setAvailability(null);
    }
    setServiceId(id);
    setBanner(null);
    setStep(2);
  };

  const chooseDate = (ymd: string) => {
    setDate(ymd);
    setSlot(null);
  };

  const updateField = (f: CustomerField, v: string) => {
    setForm((prev) => ({ ...prev, [f]: v }));
    if (serverErrors[f]) setServerErrors((prev) => ({ ...prev, [f]: undefined }));
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitAttempted(true);
    setBanner(null);
    if (!service || !slot) return;

    const payload = { ...form, serviceId: service.id, startAt: slot.startAt };
    const parsed = createBookingSchema.safeParse(payload);
    if (!parsed.success) {
      const first = Object.keys(toFieldErrors(parsed.error))[0];
      document.getElementById(`f-${first}`)?.focus();
      return;
    }

    setSubmitting(true);
    try {
      const booking = await api.createBooking(payload);
      navigate(`/booking/${booking.reference}`, { state: { booking, justBooked: true } });
    } catch (err) {
      const apiErr = err as ApiRequestError;
      if (apiErr.code === "SLOT_TAKEN" || apiErr.code === "SLOT_UNAVAILABLE") {
        setBanner(apiErr.message);
        setSlot(null);
        setReloadKey((k) => k + 1);
        setStep(2);
      } else if (apiErr.fieldErrors) {
        setServerErrors(apiErr.fieldErrors);
        setBanner(apiErr.message);
      } else {
        setBanner(apiErr.message || "Something went wrong. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  const morning = availability?.slots.filter((s) => s.label < "13:00") ?? [];
  const afternoon = availability?.slots.filter((s) => s.label >= "13:00") ?? [];
  const canReach = (n: Step) => n === 1 || (n === 2 && !!service) || (n === 3 && !!service && !!slot);

  return (
    <div className="container booking">
      <section className="hero">
        <p className="eyebrow">
          <Sparkles size={14} aria-hidden /> Online booking
        </p>
        <h1>Book your next glow-up</h1>
        <p className="hero-sub">Pick a treatment, choose a time that suits you, and you're done in under a minute.</p>
      </section>

      <ol className="stepper" aria-label="Booking steps" ref={stepperRef}>
        {STEPS.map(({ n, label }) => (
          <li key={n} className={`step ${step === n ? "is-current" : ""} ${step > n ? "is-done" : ""}`}>
            <button type="button" onClick={() => canReach(n) && setStep(n)} disabled={!canReach(n)}>
              <span className="step-dot">{step > n ? <Check size={14} /> : n}</span>
              <span className="step-label">{label}</span>
            </button>
          </li>
        ))}
      </ol>

      {banner && (
        <div className="alert alert-error" role="alert">
          <AlertCircle size={18} aria-hidden />
          <span>{banner}</span>
        </div>
      )}

      <div className="booking-grid">
        <div className="panel">
          {step === 1 && (
            <section aria-labelledby="h-service">
              <div className="panel-head">
                <h2 id="h-service">Choose a service</h2>
                <div className="chips" role="tablist" aria-label="Filter by category">
                  {categories.map((c) => (
                    <button
                      key={c}
                      type="button"
                      role="tab"
                      aria-selected={category === c}
                      className={`chip ${category === c ? "is-active" : ""}`}
                      onClick={() => setCategory(c)}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>

              {loadError && <ErrorState message={loadError} />}
              {!services && !loadError && <SkeletonList />}
              <div className="service-list">
                {visibleServices.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className={`service-card ${s.id === serviceId ? "is-selected" : ""}`}
                    onClick={() => chooseService(s.id)}
                  >
                    <span className={`service-badge cat-${s.category.toLowerCase()}`}>{s.category}</span>
                    <span className="service-main">
                      <span className="service-name">{s.name}</span>
                      <span className="service-desc">{s.description}</span>
                    </span>
                    <span className="service-meta">
                      <span className="service-price">{formatPrice(s.priceCents)}</span>
                      <span className="service-duration">
                        <Clock size={13} aria-hidden /> {formatDuration(s.durationMin)}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {step === 2 && service && studio && (
            <section aria-labelledby="h-time">
              <div className="panel-head">
                <h2 id="h-time">Pick a date and time</h2>
                <span className="muted small">Times shown in studio time ({zoneLabel(studio.timeZone)})</span>
              </div>
              <div className="datetime">
                <Calendar
                  today={studio.today}
                  maxDaysAhead={studio.maxDaysAhead}
                  closedWeekdays={studio.closedWeekdays}
                  value={date}
                  onChange={chooseDate}
                />
                <div className="slots" aria-live="polite">
                  {date && <h3 className="slots-title">{formatYmd(date)}</h3>}
                  {(slotsLoading || (!availability && !slotsError)) && (
                    <div className="slot-grid">
                      {Array.from({ length: 8 }, (_, i) => (
                        <span key={i} className="slot skeleton" />
                      ))}
                    </div>
                  )}
                  {slotsError && <ErrorState message={slotsError} />}
                  {!slotsLoading && availability && availability.slots.length === 0 && (
                    <NoSlots
                      reason={availability.closedReason}
                      onNext={() => {
                        let d = nextDay(availability.date);
                        while (!isOpenDay(d, studio.today, studio.maxDaysAhead, studio.closedWeekdays) && d < "9999") {
                          d = nextDay(d);
                        }
                        chooseDate(d);
                      }}
                    />
                  )}
                  {!slotsLoading &&
                    availability &&
                    [
                      ["Morning", morning],
                      ["Afternoon", afternoon],
                    ].map(([label, list]) =>
                      (list as Slot[]).length ? (
                        <div key={label as string} className="slot-group">
                          <p className="slot-group-label">{label as string}</p>
                          <div className="slot-grid">
                            {(list as Slot[]).map((s) => (
                              <button
                                key={s.startAt}
                                type="button"
                                className={`slot ${slot?.startAt === s.startAt ? "is-selected" : ""}`}
                                aria-pressed={slot?.startAt === s.startAt}
                                onClick={() => {
                                  setSlot(s);
                                  setBanner(null);
                                }}
                              >
                                {formatClockLabel(s.label)}
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : null,
                    )}
                </div>
              </div>
              <div className="panel-actions">
                <button type="button" className="btn btn-ghost" onClick={() => setStep(1)}>
                  <ArrowLeft size={16} /> Back
                </button>
                <button type="button" className="btn btn-primary" disabled={!slot} onClick={() => setStep(3)}>
                  Continue <ArrowRight size={16} />
                </button>
              </div>
            </section>
          )}

          {step === 3 && service && slot && (
            <section aria-labelledby="h-details">
              <div className="panel-head">
                <h2 id="h-details">Your details</h2>
                <span className="muted small">We'll send your confirmation by email.</span>
              </div>
              <form className="form" onSubmit={submit} noValidate>
                <Field
                  id="customerName"
                  label="Full name"
                  autoComplete="name"
                  value={form.customerName}
                  error={fieldError("customerName")}
                  onChange={(v) => updateField("customerName", v)}
                  onBlur={() => setTouched((t) => ({ ...t, customerName: true }))}
                  placeholder="Jane Doe"
                />
                <div className="form-row">
                  <Field
                    id="phone"
                    label="Phone"
                    type="tel"
                    autoComplete="tel"
                    value={form.phone}
                    error={fieldError("phone")}
                    onChange={(v) => updateField("phone", v)}
                    onBlur={() => setTouched((t) => ({ ...t, phone: true }))}
                    placeholder="+1 (212) 555-0100"
                  />
                  <Field
                    id="email"
                    label="Email"
                    type="email"
                    autoComplete="email"
                    value={form.email}
                    error={fieldError("email")}
                    onChange={(v) => updateField("email", v)}
                    onBlur={() => setTouched((t) => ({ ...t, email: true }))}
                    placeholder="jane@example.com"
                  />
                </div>
                <Field
                  id="notes"
                  label="Notes"
                  optional
                  multiline
                  value={form.notes}
                  error={fieldError("notes")}
                  onChange={(v) => updateField("notes", v)}
                  onBlur={() => setTouched((t) => ({ ...t, notes: true }))}
                  placeholder="Allergies, preferences, anything we should know"
                  hint={`${form.notes.length}/500`}
                />
                <div className="panel-actions">
                  <button type="button" className="btn btn-ghost" onClick={() => setStep(2)}>
                    <ArrowLeft size={16} /> Back
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={submitting}>
                    {submitting ? <Loader2 size={16} className="spin" /> : <Check size={16} />}
                    {submitting ? "Booking…" : "Confirm booking"}
                  </button>
                </div>
              </form>
            </section>
          )}
        </div>

        <aside className="summary" aria-label="Booking summary">
          <h2 className="summary-title">Your appointment</h2>
          {service ? (
            <dl className="summary-list">
              <div>
                <dt>Service</dt>
                <dd>{service.name}</dd>
              </div>
              <div>
                <dt>Duration</dt>
                <dd>{formatDuration(service.durationMin)}</dd>
              </div>
              <div>
                <dt>Date</dt>
                <dd>{date && step > 1 ? formatYmd(date, { weekday: "short", month: "short", day: "numeric" }) : "—"}</dd>
              </div>
              <div>
                <dt>Time</dt>
                <dd>{slot ? formatClockLabel(slot.label) : "—"}</dd>
              </div>
              <div className="summary-total">
                <dt>Total</dt>
                <dd>{formatPrice(service.priceCents)}</dd>
              </div>
            </dl>
          ) : (
            <p className="muted small">Choose a service to get started.</p>
          )}
          <p className="summary-note">Pay at the studio. Free cancellation up to 24 hours before.</p>
        </aside>
      </div>
    </div>
  );
}

interface FieldProps {
  id: BookingField;
  label: string;
  value: string;
  error?: string;
  onChange: (v: string) => void;
  onBlur: () => void;
  type?: string;
  autoComplete?: string;
  placeholder?: string;
  optional?: boolean;
  multiline?: boolean;
  hint?: string;
}

function Field({ id, label, value, error, onChange, onBlur, type = "text", autoComplete, placeholder, optional, multiline, hint }: FieldProps) {
  const inputId = `f-${id}`;
  const errorId = `${inputId}-error`;
  const common = {
    id: inputId,
    name: id,
    value,
    placeholder,
    onBlur,
    "aria-invalid": !!error,
    "aria-describedby": error ? errorId : undefined,
  };
  return (
    <div className={`field ${error ? "has-error" : ""}`}>
      <label htmlFor={inputId}>
        {label} {optional && <span className="optional">(optional)</span>}
        {hint && <span className="hint">{hint}</span>}
      </label>
      {multiline ? (
        <textarea {...common} rows={3} maxLength={500} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input {...common} type={type} autoComplete={autoComplete} onChange={(e) => onChange(e.target.value)} />
      )}
      {error && (
        <p className="field-error" id={errorId}>
          {error}
        </p>
      )}
    </div>
  );
}

function NoSlots({ reason, onNext }: { reason?: Availability["closedReason"]; onNext: () => void }) {
  const text =
    reason === "CLOSED_DAY"
      ? "We're closed on this day."
      : reason === "TOO_FAR_AHEAD"
        ? "This date is beyond our booking window."
        : "No times left on this day.";
  return (
    <div className="empty">
      <p>{text}</p>
      {reason !== "TOO_FAR_AHEAD" && (
        <button type="button" className="btn btn-soft" onClick={onNext}>
          Try the next open day <ArrowRight size={16} />
        </button>
      )}
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="alert alert-error" role="alert">
      <AlertCircle size={18} aria-hidden />
      <span>{message}</span>
    </div>
  );
}

function SkeletonList() {
  return (
    <div className="service-list">
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="service-card skeleton" style={{ height: 84 }} />
      ))}
    </div>
  );
}
