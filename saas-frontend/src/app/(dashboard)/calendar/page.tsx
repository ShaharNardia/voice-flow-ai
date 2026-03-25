"use client";

import { useState, useEffect, useCallback } from "react";
import {
  appointmentsList,
  assistantsList,
  type Appointment,
  type Assistant,
} from "@/lib/firebase-functions";
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

  // Today key for highlighting
  const todayKey = new Date().toISOString().slice(0, 10);

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

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-neutral-900">Calendar</h2>
        <p className="text-sm text-neutral-500 mt-0.5">
          Appointments and scheduled follow-ups
        </p>
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
      {!loading && appointments.length === 0 && (
        <div className="mt-8 text-center">
          <Calendar className="w-8 h-8 text-neutral-200 mx-auto mb-2" />
          <p className="text-neutral-400 text-sm">No appointments this month</p>
        </div>
      )}

      {/* Detail popover */}
      {selected && (
        <DetailPopover
          appt={selected}
          assistants={assistants}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
