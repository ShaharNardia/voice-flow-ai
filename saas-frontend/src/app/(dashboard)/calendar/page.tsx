"use client";

import { useState, useEffect, useCallback } from "react";
import {
  appointmentsList,
  assistantsList,
  bookingsList,
  bookingsCreate,
  bookingsUpdate,
  bookingsCancel,
  type Appointment,
  type Assistant,
  type BookingAppointment,
} from "@/lib/firebase-functions";
import { useFeatures } from "@/lib/features";
import { formatPhone } from "@/lib/utils";
import {
  ChevronLeft,
  ChevronRight,
  Calendar,
  Phone,
  Clock,
  User,
  Bot,
  ExternalLink,
  X,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  MapPin,
  Mail,
} from "lucide-react";

// ── Helpers ───────────────────────────────────────────────────────────────────

function toDateKey(value: unknown): string | null {
  if (!value) return null;
  // Firestore Timestamp object
  if (
    typeof value === "object" &&
    value !== null &&
    "toDate" in value &&
    typeof (value as { toDate: unknown }).toDate === "function"
  ) {
    const d = (value as { toDate: () => Date }).toDate();
    return d.toISOString().slice(0, 10);
  }
  // String or number epoch
  if (typeof value === "string" || typeof value === "number") {
    const d = new Date(value);
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  return null;
}

function toDisplayTime(value: unknown): string {
  if (!value) return "";
  if (
    typeof value === "object" &&
    value !== null &&
    "toDate" in value &&
    typeof (value as { toDate: unknown }).toDate === "function"
  ) {
    const d = (value as { toDate: () => Date }).toDate();
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  if (typeof value === "string" || typeof value === "number") {
    const d = new Date(value);
    if (!isNaN(d.getTime()))
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  return typeof value === "string" ? value : "";
}

function outcomeColors(outcome?: string): string {
  if (outcome === "success") return "bg-green-100 text-green-800";
  if (outcome === "failed" || outcome === "no_answer")
    return "bg-red-100 text-red-700";
  return "bg-blue-100 text-blue-800";
}

function outcomeBadge(outcome?: string): string {
  if (!outcome) return "Unknown";
  return outcome.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// ── Calendar grid builder ─────────────────────────────────────────────────────

interface CalendarCell {
  date: Date;
  isCurrentMonth: boolean;
  dateKey: string; // "YYYY-MM-DD"
}

function buildCalendarGrid(year: number, month: number): CalendarCell[] {
  const firstDay = new Date(year, month, 1);
  // Sunday = 0; step back to the Sunday before the 1st
  const startDate = new Date(firstDay);
  startDate.setDate(firstDay.getDate() - firstDay.getDay());

  const cells: CalendarCell[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(startDate);
    d.setDate(startDate.getDate() + i);
    cells.push({
      date: d,
      isCurrentMonth: d.getMonth() === month,
      dateKey: d.toISOString().slice(0, 10),
    });
  }
  return cells;
}

// ── Sub-components ────────────────────────────────────────────────────────────

interface AppointmentCardProps {
  appt: Appointment;
  onClick: (appt: Appointment) => void;
}

function AppointmentCard({ appt, onClick }: AppointmentCardProps) {
  const outcome = appt.analysis?.outcome;
  const colorClass = outcomeColors(outcome);
  const name = appt.customerName
    ? appt.customerName.length > 20
      ? appt.customerName.slice(0, 19) + "…"
      : appt.customerName
    : "Unknown";
  const time = appt.time ? appt.time : toDisplayTime(appt.createdAt);

  return (
    <button
      onClick={() => onClick(appt)}
      className={`w-full text-left px-1.5 py-0.5 rounded text-xs font-medium truncate leading-5 ${colorClass} hover:opacity-80 transition-opacity`}
    >
      <span>{name}</span>
      {time && <span className="opacity-70 ml-1">{time}</span>}
    </button>
  );
}

interface DetailPopoverProps {
  appt: Appointment;
  assistants: Assistant[];
  onClose: () => void;
}

function DetailPopover({ appt, assistants, onClose }: DetailPopoverProps) {
  const outcome = appt.analysis?.outcome;
  const colorClass = outcomeColors(outcome);
  const time = appt.time ? appt.time : toDisplayTime(appt.createdAt);
  const assistantRecord = assistants.find((a) => a.id === appt.assistantId);
  const assistantLabel =
    appt.assistantName || assistantRecord?.name || assistantRecord?.assistantName || "Unknown assistant";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-neutral-400 hover:text-neutral-600 transition-colors"
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Customer name */}
        <h3 className="text-base font-semibold text-neutral-900 pr-6">
          {appt.customerName || "Unknown Customer"}
        </h3>

        <div className="mt-4 space-y-3 text-sm text-neutral-700">
          {/* Phone */}
          {appt.customerPhone && (
            <div className="flex items-center gap-2">
              <Phone className="w-4 h-4 flex-shrink-0 text-neutral-400" />
              <span>{formatPhone(appt.customerPhone)}</span>
            </div>
          )}

          {/* Service */}
          {appt.service && (
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 flex-shrink-0 text-neutral-400" />
              <span>{appt.service}</span>
            </div>
          )}

          {/* Time */}
          {time && (
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 flex-shrink-0 text-neutral-400" />
              <span>{time}</span>
            </div>
          )}

          {/* Assistant */}
          <div className="flex items-center gap-2">
            <Bot className="w-4 h-4 flex-shrink-0 text-neutral-400" />
            <span>{assistantLabel}</span>
          </div>

          {/* Outcome badge */}
          {outcome && (
            <div>
              <span
                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${colorClass}`}
              >
                {outcomeBadge(outcome)}
              </span>
            </div>
          )}

          {/* AI Summary */}
          {appt.analysis?.summary && (
            <div>
              <p className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-1">
                AI Summary
              </p>
              <div className="bg-neutral-100 rounded-lg px-3 py-2 text-xs text-neutral-600 leading-relaxed">
                {appt.analysis.summary}
              </div>
            </div>
          )}
        </div>

        {/* View Call link */}
        {appt.callSessionId && (
          <div className="mt-5 pt-4 border-t border-neutral-100">
            <a
              href={`/calls/detail?id=${encodeURIComponent(appt.callSessionId)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-[#F22F46] hover:underline"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              View Call
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Manual bookings (appointments collection) ─────────────────────────────────

// ISO string → value for <input type="datetime-local"> (local wall-clock time).
function toLocalInput(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function bookingTimeLabel(b: BookingAppointment): string {
  const s = new Date(b.startAt);
  if (isNaN(s.getTime())) return "";
  return s.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function BookingChip({ booking, onClick }: { booking: BookingAppointment; onClick: (b: BookingAppointment) => void }) {
  const cancelled = booking.status === "cancelled";
  return (
    <button
      onClick={() => onClick(booking)}
      title={booking.title}
      className={`w-full text-left px-1.5 py-0.5 rounded text-xs font-medium truncate leading-5 border transition-opacity hover:opacity-80 ${
        cancelled
          ? "bg-neutral-100 text-neutral-400 border-neutral-200 line-through"
          : "bg-[#F22F46]/10 text-[#B91C2C] border-[#F22F46]/30"
      }`}
    >
      <span>{booking.title || "Appointment"}</span>
      <span className="opacity-70 ml-1">{bookingTimeLabel(booking)}</span>
    </button>
  );
}

function BookingDetail({
  booking, assistants, onClose, onEdit, onCancelled,
}: {
  booking: BookingAppointment;
  assistants: Assistant[];
  onClose: () => void;
  onEdit: (b: BookingAppointment) => void;
  onCancelled: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const assistant = assistants.find((a) => a.id === booking.assistantId);
  const start = new Date(booking.startAt);
  const end = new Date(booking.endAt);
  const when = !isNaN(start.getTime())
    ? `${start.toLocaleDateString()} · ${start.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` +
      (!isNaN(end.getTime()) ? `–${end.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "")
    : "";

  async function cancel() {
    if (!confirm("Cancel this appointment? The attendee will keep any prior invite — this only marks it cancelled here.")) return;
    setBusy(true);
    try { await bookingsCancel(booking.id); onCancelled(); } finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-4 right-4 text-neutral-400 hover:text-neutral-600" aria-label="Close"><X className="w-4 h-4" /></button>
        <h3 className="text-base font-semibold text-neutral-900 pr-6">{booking.title || "Appointment"}</h3>
        {booking.status === "cancelled" && <span className="inline-block mt-1 text-xs font-medium text-neutral-500 bg-neutral-100 rounded-full px-2 py-0.5">Cancelled</span>}

        <div className="mt-4 space-y-3 text-sm text-neutral-700">
          {when && <div className="flex items-center gap-2"><Clock className="w-4 h-4 text-neutral-400" /><span>{when}</span></div>}
          {booking.attendeeName && <div className="flex items-center gap-2"><User className="w-4 h-4 text-neutral-400" /><span>{booking.attendeeName}</span></div>}
          {booking.attendeePhone && <div className="flex items-center gap-2"><Phone className="w-4 h-4 text-neutral-400" /><span>{formatPhone(booking.attendeePhone)}</span></div>}
          {booking.attendeeEmail && <div className="flex items-center gap-2"><Mail className="w-4 h-4 text-neutral-400" /><span>{booking.attendeeEmail}</span></div>}
          {booking.location && <div className="flex items-center gap-2"><MapPin className="w-4 h-4 text-neutral-400" /><span>{booking.location}</span></div>}
          {assistant && <div className="flex items-center gap-2"><Bot className="w-4 h-4 text-neutral-400" /><span>{assistant.name || assistant.assistantName || assistant.id}</span></div>}
          {booking.notes && (
            <div>
              <p className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-1">Notes</p>
              <div className="bg-neutral-100 rounded-lg px-3 py-2 text-xs text-neutral-600 leading-relaxed whitespace-pre-wrap">{booking.notes}</div>
            </div>
          )}
        </div>

        {booking.status !== "cancelled" && (
          <div className="mt-5 pt-4 border-t border-neutral-100 flex items-center gap-2">
            <button onClick={() => onEdit(booking)} className="inline-flex items-center gap-1.5 text-sm font-medium text-neutral-700 bg-neutral-100 hover:bg-neutral-200 rounded-lg px-3 py-1.5">
              <Pencil className="w-3.5 h-3.5" /> Edit
            </button>
            <button onClick={cancel} disabled={busy} className="inline-flex items-center gap-1.5 text-sm font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-lg px-3 py-1.5 disabled:opacity-60">
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />} Cancel appointment
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function BookingModal({
  editing, assistants, defaultDate, onClose, onSaved,
}: {
  editing: BookingAppointment | null;
  assistants: Assistant[];
  defaultDate: Date;
  onClose: () => void;
  onSaved: () => void;
}) {
  const seedStart = editing
    ? toLocalInput(editing.startAt)
    : toLocalInput(new Date(defaultDate.getFullYear(), defaultDate.getMonth(), defaultDate.getDate(), 10, 0).toISOString());
  const seedEnd = editing
    ? toLocalInput(editing.endAt)
    : toLocalInput(new Date(defaultDate.getFullYear(), defaultDate.getMonth(), defaultDate.getDate(), 10, 30).toISOString());

  const [title, setTitle] = useState(editing?.title || "");
  const [startAt, setStartAt] = useState(seedStart);
  const [endAt, setEndAt] = useState(seedEnd);
  const [attendeeName, setAttendeeName] = useState(editing?.attendeeName || "");
  const [attendeePhone, setAttendeePhone] = useState(editing?.attendeePhone || "");
  const [attendeeEmail, setAttendeeEmail] = useState(editing?.attendeeEmail || "");
  const [location, setLocation] = useState(editing?.location || "");
  const [notes, setNotes] = useState(editing?.notes || "");
  const [assistantId, setAssistantId] = useState(editing?.assistantId || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Keep end ≥ start: when start moves past end, push end to start + 30 min.
  function onStartChange(v: string) {
    setStartAt(v);
    if (v && (!endAt || endAt <= v)) {
      const d = new Date(v);
      if (!isNaN(d.getTime())) setEndAt(toLocalInput(new Date(d.getTime() + 30 * 60000).toISOString()));
    }
  }

  async function submit() {
    setError("");
    if (!title.trim()) return setError("Title is required.");
    if (!startAt || !endAt) return setError("Start and end time are required.");
    const s = new Date(startAt), e = new Date(endAt);
    if (isNaN(+s) || isNaN(+e)) return setError("Invalid date/time.");
    if (+e <= +s) return setError("End must be after start.");
    setSaving(true);
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    try {
      if (editing) {
        await bookingsUpdate({
          id: editing.id, title: title.trim(), startAt: s.toISOString(), endAt: e.toISOString(),
          attendeeName, attendeePhone, attendeeEmail, location, notes, timezone: tz,
        });
      } else {
        await bookingsCreate({
          title: title.trim(), startAt: s.toISOString(), endAt: e.toISOString(),
          attendeeName, attendeePhone, attendeeEmail, location, notes, timezone: tz,
          assistantId: assistantId || undefined,
        });
      }
      onSaved();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save.");
      setSaving(false);
    }
  }

  const inputCls = "w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#F22F46]/30 focus:border-[#F22F46]";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-4 right-4 text-neutral-400 hover:text-neutral-600" aria-label="Close"><X className="w-4 h-4" /></button>
        <h3 className="text-base font-semibold text-neutral-900">{editing ? "Edit appointment" : "New appointment"}</h3>

        <div className="mt-4 space-y-3">
          <div>
            <label className="block text-xs font-medium text-neutral-500 mb-1">Title *</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Eye exam — Mr. Cohen" className={inputCls} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-neutral-500 mb-1">Start *</label>
              <input type="datetime-local" value={startAt} onChange={(e) => onStartChange(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-500 mb-1">End *</label>
              <input type="datetime-local" value={endAt} onChange={(e) => setEndAt(e.target.value)} className={inputCls} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-neutral-500 mb-1">Attendee name</label>
              <input value={attendeeName} onChange={(e) => setAttendeeName(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-500 mb-1">Phone</label>
              <input value={attendeePhone} onChange={(e) => setAttendeePhone(e.target.value)} className={inputCls} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-500 mb-1">Email (sends a calendar invite)</label>
            <input type="email" value={attendeeEmail} onChange={(e) => setAttendeeEmail(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-500 mb-1">Location</label>
            <input value={location} onChange={(e) => setLocation(e.target.value)} className={inputCls} />
          </div>
          {!editing && assistants.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-neutral-500 mb-1">Assistant (optional)</label>
              <select value={assistantId} onChange={(e) => setAssistantId(e.target.value)} className={inputCls}>
                <option value="">— None —</option>
                {assistants.map((a) => <option key={a.id} value={a.id}>{a.name || a.assistantName || a.id}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-neutral-500 mb-1">Notes</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={inputCls} />
          </div>
        </div>

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        <div className="mt-5 flex items-center justify-end gap-2">
          <button onClick={onClose} className="text-sm font-medium text-neutral-600 px-4 py-2 rounded-lg hover:bg-neutral-100">Cancel</button>
          <button onClick={submit} disabled={saving} className="inline-flex items-center gap-1.5 text-sm font-medium text-white px-4 py-2 rounded-lg disabled:opacity-60" style={{ backgroundColor: "#F22F46" }}>
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}{editing ? "Save changes" : "Create appointment"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function CalendarPage() {
  // Display state
  const [currentDate, setCurrentDate] = useState<Date>(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  // Data
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [assistants, setAssistants] = useState<Assistant[]>([]);
  const [filterAssistantId, setFilterAssistantId] = useState<string>("");
  const [loading, setLoading] = useState(true);

  // Popover
  const [selected, setSelected] = useState<Appointment | null>(null);

  // Manual bookings (appointments collection) + modals
  const { has } = useFeatures();
  const canBook = has("cap.appointments");
  const [bookings, setBookings] = useState<BookingAppointment[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<BookingAppointment | null>(null);
  const [selectedBooking, setSelectedBooking] = useState<BookingAppointment | null>(null);

  // Today key for highlighting
  const todayKey = new Date().toISOString().slice(0, 10);

  // ── Load manual bookings (refetched after create/edit/cancel) ─────────
  const loadBookings = useCallback(async () => {
    try {
      const { items } = await bookingsList();
      setBookings(items || []);
    } catch {
      setBookings([]);
    }
  }, []);

  useEffect(() => {
    loadBookings();
  }, [loadBookings]);

  // ── Load assistants once ──────────────────────────────────────────────
  useEffect(() => {
    assistantsList()
      .then(setAssistants)
      .catch(() => {});
  }, []);

  // ── Load appointments when month or filter changes ────────────────────
  const loadAppointments = useCallback(async () => {
    setLoading(true);
    try {
      const year = currentDate.getFullYear();
      const month = currentDate.getMonth();
      const from = new Date(year, month, 1).toISOString();
      const to = new Date(year, month + 1, 0, 23, 59, 59, 999).toISOString();
      const params: { assistantId?: string; from: string; to: string } = { from, to };
      if (filterAssistantId) params.assistantId = filterAssistantId;
      const data = await appointmentsList(params);
      setAppointments(data);
    } catch {
      setAppointments([]);
    } finally {
      setLoading(false);
    }
  }, [currentDate, filterAssistantId]);

  useEffect(() => {
    loadAppointments();
  }, [loadAppointments]);

  // ── Month navigation ──────────────────────────────────────────────────
  const prevMonth = () =>
    setCurrentDate((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1));
  const nextMonth = () =>
    setCurrentDate((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1));

  // ── Build grid + appointment map ──────────────────────────────────────
  const cells = buildCalendarGrid(currentDate.getFullYear(), currentDate.getMonth());

  const appointmentsByDate = appointments.reduce<Record<string, Appointment[]>>(
    (acc, appt) => {
      const key = toDateKey(appt.createdAt);
      if (key) {
        acc[key] = acc[key] ? [...acc[key], appt] : [appt];
      }
      return acc;
    },
    {}
  );

  // Manual bookings keyed by their scheduled start date, honoring the
  // assistant filter so the calendar stays consistent with the dropdown.
  const bookingsByDate = bookings.reduce<Record<string, BookingAppointment[]>>(
    (acc, b) => {
      if (filterAssistantId && b.assistantId !== filterAssistantId) return acc;
      const key = toDateKey(b.startAt);
      if (key) acc[key] = acc[key] ? [...acc[key], b] : [b];
      return acc;
    },
    {}
  );

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-neutral-900">Calendar</h2>
          <p className="text-sm text-neutral-500 mt-0.5">
            Appointments and scheduled follow-ups
          </p>
        </div>
        {canBook && (
          <button
            onClick={() => { setEditing(null); setModalOpen(true); }}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-white px-3.5 py-2 rounded-lg shadow-sm"
            style={{ backgroundColor: "#F22F46" }}
          >
            <Plus className="w-4 h-4" /> New appointment
          </button>
        )}
      </div>

      {/* Filter bar */}
      <div className="flex items-center justify-between gap-4 mb-5">
        {/* Assistant filter */}
        <select
          value={filterAssistantId}
          onChange={(e) => setFilterAssistantId(e.target.value)}
          className="text-sm border border-neutral-200 rounded-lg px-3 py-2 bg-white text-neutral-700 focus:outline-none focus:ring-2 focus:ring-[#F22F46]/30 focus:border-[#F22F46] min-w-[180px]"
        >
          <option value="">All Assistants</option>
          {assistants.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name || a.assistantName || a.id}
            </option>
          ))}
        </select>

        {/* Month/Year navigation */}
        <div className="flex items-center gap-2">
          <button
            onClick={prevMonth}
            className="p-1.5 rounded-lg text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700 transition-colors"
            aria-label="Previous month"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm font-medium text-neutral-800 min-w-[130px] text-center">
            {MONTH_NAMES[currentDate.getMonth()]} {currentDate.getFullYear()}
          </span>
          <button
            onClick={nextMonth}
            className="p-1.5 rounded-lg text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700 transition-colors"
            aria-label="Next month"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Calendar grid */}
      <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
        {/* Day-of-week header */}
        <div className="grid grid-cols-7 border-b border-neutral-100">
          {DAY_LABELS.map((day) => (
            <div
              key={day}
              className="px-2 py-2.5 text-center text-xs font-medium text-neutral-400 uppercase tracking-wide"
            >
              {day}
            </div>
          ))}
        </div>

        {/* Loading overlay */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-6 h-6 border-2 border-[#F22F46] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-7">
            {cells.map((cell, idx) => {
              const dayAppts = appointmentsByDate[cell.dateKey] ?? [];
              const dayBookings = bookingsByDate[cell.dateKey] ?? [];
              const isToday = cell.dateKey === todayKey;
              const visible = dayAppts.slice(0, 3);
              const overflow = dayAppts.length - 3;

              return (
                <div
                  key={idx}
                  className={[
                    "min-h-[100px] p-1.5 border-b border-r border-neutral-100 last:border-r-0",
                    !cell.isCurrentMonth ? "bg-neutral-50" : "bg-white",
                  ].join(" ")}
                >
                  {/* Day number */}
                  <div className="flex justify-end mb-1">
                    <span
                      className={[
                        "inline-flex items-center justify-center w-6 h-6 text-xs rounded-full font-medium",
                        isToday
                          ? "border-2 border-[#F22F46] text-[#F22F46] font-semibold"
                          : cell.isCurrentMonth
                          ? "text-neutral-700"
                          : "text-neutral-300",
                      ].join(" ")}
                    >
                      {cell.date.getDate()}
                    </span>
                  </div>

                  {/* Appointment cards */}
                  <div className="space-y-0.5">
                    {dayBookings.map((b) => (
                      <BookingChip key={b.id} booking={b} onClick={setSelectedBooking} />
                    ))}
                    {visible.map((appt) => (
                      <AppointmentCard
                        key={appt.id}
                        appt={appt}
                        onClick={setSelected}
                      />
                    ))}
                    {overflow > 0 && (
                      <p className="text-xs text-neutral-400 pl-1">
                        +{overflow} more
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Empty state */}
      {!loading && appointments.length === 0 && bookings.length === 0 && (
        <div className="mt-8 text-center">
          <Calendar className="w-8 h-8 text-neutral-200 mx-auto mb-2" />
          <p className="text-neutral-400 text-sm">No appointments this month</p>
          {canBook && (
            <button
              onClick={() => { setEditing(null); setModalOpen(true); }}
              className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-[#F22F46] hover:underline"
            >
              <Plus className="w-4 h-4" /> Add one
            </button>
          )}
        </div>
      )}

      {/* Detail popover (call-derived) */}
      {selected && (
        <DetailPopover
          appt={selected}
          assistants={assistants}
          onClose={() => setSelected(null)}
        />
      )}

      {/* Booking detail (manual / tool-booked) */}
      {selectedBooking && (
        <BookingDetail
          booking={selectedBooking}
          assistants={assistants}
          onClose={() => setSelectedBooking(null)}
          onEdit={(b) => { setSelectedBooking(null); setEditing(b); setModalOpen(true); }}
          onCancelled={() => { setSelectedBooking(null); loadBookings(); }}
        />
      )}

      {/* Create / edit modal */}
      {modalOpen && (
        <BookingModal
          editing={editing}
          assistants={assistants}
          defaultDate={currentDate}
          onClose={() => { setModalOpen(false); setEditing(null); }}
          onSaved={() => { setModalOpen(false); setEditing(null); loadBookings(); }}
        />
      )}
    </div>
  );
}
