import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Clock,
  Monitor,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  Users,
} from "lucide-react";
import {
  COMPUTERS,
  DAYS,
  DEFAULT_STUDENTS,
  STARTER_PLANNER,
  normalizePlanner,
} from "./plannerData.js";

const EMPTY_FORM = {
  studentId: DEFAULT_STUDENTS[0].id,
  day: DAYS[0].id,
  start: "09:00",
  end: "13:00",
};

const LOCAL_BACKUP_KEY = "office-computer-planner-v1";
const SYNC_LABELS = {
  loading: "Loading shared schedule",
  live: "Live shared schedule",
  saving: "Saving updates",
  reconnecting: "Reconnecting",
  offline: "Offline backup",
};

function readLocalBackup() {
  try {
    const saved = window.localStorage.getItem(LOCAL_BACKUP_KEY);
    return saved ? normalizePlanner(JSON.parse(saved)) : null;
  } catch {
    return null;
  }
}

function getPlannerFromResponse(payload) {
  return normalizePlanner(payload?.planner ?? payload);
}

async function fetchSharedPlanner() {
  const response = await fetch("/api/planner", {
    cache: "no-store",
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error("Unable to load shared schedule.");
  }

  return response.json();
}

async function putSharedPlanner(planner) {
  const response = await fetch("/api/planner", {
    method: "PUT",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(planner),
  });

  if (!response.ok) {
    throw new Error("Unable to save shared schedule.");
  }

  return response.json();
}

function useSharedPlanner() {
  const [planner, setPlannerState] = useState(() => readLocalBackup() ?? STARTER_PLANNER);
  const [syncStatus, setSyncStatus] = useState("loading");
  const saveCounter = useRef(0);
  const isSavingRef = useRef(false);

  useEffect(() => {
    try {
      window.localStorage.setItem(LOCAL_BACKUP_KEY, JSON.stringify(planner));
    } catch {
      // Shared server storage still works if this browser blocks local backup.
    }
  }, [planner]);

  const loadFromServer = useCallback(async () => {
    try {
      const payload = await fetchSharedPlanner();
      setPlannerState(getPlannerFromResponse(payload));
      setSyncStatus("live");
      return payload;
    } catch {
      setSyncStatus("offline");
      return null;
    }
  }, []);

  const saveToServer = useCallback(async (nextPlanner) => {
    const requestId = saveCounter.current + 1;
    saveCounter.current = requestId;
    isSavingRef.current = true;
    setSyncStatus("saving");

    try {
      const payload = await putSharedPlanner(nextPlanner);
      if (requestId === saveCounter.current) {
        setPlannerState(getPlannerFromResponse(payload));
        setSyncStatus("live");
        isSavingRef.current = false;
      }
    } catch {
      if (requestId === saveCounter.current) {
        setSyncStatus("offline");
        isSavingRef.current = false;
      }
    }
  }, []);

  const setPlanner = useCallback(
    (updater) => {
      setPlannerState((current) => {
        const nextPlanner = normalizePlanner(
          typeof updater === "function" ? updater(current) : updater,
        );
        saveToServer(nextPlanner);
        return nextPlanner;
      });
    },
    [saveToServer],
  );

  useEffect(() => {
    let cancelled = false;
    const localBackup = readLocalBackup();

    fetchSharedPlanner()
      .then((payload) => {
        if (cancelled) return;

        const sharedPlanner = getPlannerFromResponse(payload);
        if (payload?.created && localBackup) {
          setPlannerState(localBackup);
          saveToServer(localBackup);
        } else {
          setPlannerState(sharedPlanner);
          setSyncStatus("live");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSyncStatus("offline");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [saveToServer]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (!isSavingRef.current) {
        loadFromServer();
      }
    }, 5000);

    return () => window.clearInterval(interval);
  }, [loadFromServer]);

  return [planner, setPlanner, syncStatus];
}

function createId(prefix) {
  if (window.crypto?.randomUUID) {
    return `${prefix}-${window.crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function timeToMinutes(time) {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function formatTime(value) {
  const minutes = typeof value === "number" ? value : timeToMinutes(value);
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  const period = hours >= 12 ? "PM" : "AM";
  const displayHour = hours % 12 || 12;
  return `${displayHour}:${String(mins).padStart(2, "0")} ${period}`;
}

function getComputerName(computerId) {
  return COMPUTERS.find((computer) => computer.id === computerId)?.name ?? "Computer";
}

function getStudentName(studentId, students) {
  return students.find((student) => student.id === studentId)?.name ?? "Unknown student";
}

function sortShifts(a, b) {
  return (
    DAYS.findIndex((day) => day.id === a.day) -
      DAYS.findIndex((day) => day.id === b.day) ||
    timeToMinutes(a.start) - timeToMinutes(b.start) ||
    timeToMinutes(a.end) - timeToMinutes(b.end)
  );
}

function getDayWindow(dayShifts) {
  if (dayShifts.length === 0) {
    return [8 * 60, 18 * 60];
  }

  const starts = dayShifts.map((shift) => timeToMinutes(shift.start));
  const ends = dayShifts.map((shift) => timeToMinutes(shift.end));
  const minStart = Math.min(...starts);
  const maxEnd = Math.max(...ends);
  const start = Math.min(8 * 60, Math.floor(minStart / 60) * 60);
  const end = Math.max(18 * 60, Math.ceil(maxEnd / 60) * 60);

  return [start, end];
}

function buildDailyAssignments(students, shifts, selectedDay) {
  const dayShifts = shifts
    .filter((shift) => shift.day === selectedDay)
    .map((shift) => ({
      ...shift,
      startMinutes: timeToMinutes(shift.start),
      endMinutes: timeToMinutes(shift.end),
      student: students.find((student) => student.id === shift.studentId),
    }))
    .filter((shift) => shift.student && shift.endMinutes > shift.startMinutes)
    .sort((a, b) => a.startMinutes - b.startMinutes);

  const [windowStart, windowEnd] = getDayWindow(dayShifts);
  const rows = [];
  let previousAssignments = new Map();

  for (let time = windowStart; time < windowEnd; time += 30) {
    const active = dayShifts
      .filter((shift) => shift.startMinutes <= time && shift.endMinutes > time)
      .sort((a, b) => {
        const computerOrder =
          COMPUTERS.findIndex((computer) => computer.id === a.student.preferredComputerId) -
          COMPUTERS.findIndex((computer) => computer.id === b.student.preferredComputerId);
        return (
          a.startMinutes - b.startMinutes ||
          computerOrder ||
          a.student.name.localeCompare(b.student.name)
        );
      });

    const assignments = new Map();
    const assignedStudents = new Set();

    for (const shift of active) {
      const previousComputerId = previousAssignments.get(shift.student.id);
      if (previousComputerId && !assignments.has(previousComputerId)) {
        assignments.set(previousComputerId, shift);
        assignedStudents.add(shift.student.id);
      }
    }

    for (const shift of active) {
      if (assignedStudents.has(shift.student.id)) continue;
      const preferredComputerId = shift.student.preferredComputerId;
      if (preferredComputerId && !assignments.has(preferredComputerId)) {
        assignments.set(preferredComputerId, shift);
        assignedStudents.add(shift.student.id);
      }
    }

    for (const shift of active) {
      if (assignedStudents.has(shift.student.id)) continue;
      const openComputer = COMPUTERS.find((computer) => !assignments.has(computer.id));
      if (openComputer) {
        assignments.set(openComputer.id, shift);
        assignedStudents.add(shift.student.id);
      }
    }

    const unassigned = active.filter((shift) => !assignedStudents.has(shift.student.id));
    previousAssignments = new Map(
      [...assignments.entries()].map(([computerId, shift]) => [shift.student.id, computerId]),
    );

    rows.push({
      start: time,
      end: time + 30,
      assignments,
      unassigned,
      activeCount: active.length,
    });
  }

  return rows;
}

function buildConflictRanges(rows) {
  const ranges = [];
  let current = null;

  for (const row of rows) {
    if (row.unassigned.length === 0) {
      if (current) {
        ranges.push(current);
        current = null;
      }
      continue;
    }

    const names = row.unassigned.map((shift) => shift.student.name).join(", ");
    if (current && current.names === names && current.end === row.start) {
      current.end = row.end;
    } else {
      if (current) ranges.push(current);
      current = { start: row.start, end: row.end, names };
    }
  }

  if (current) ranges.push(current);
  return ranges;
}

function App() {
  const [{ students, shifts }, setPlanner, syncStatus] = useSharedPlanner();
  const [selectedDay, setSelectedDay] = useState(DAYS[0].id);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingShiftId, setEditingShiftId] = useState(null);
  const [formError, setFormError] = useState("");
  const [compactView, setCompactView] = useState(true);

  const selectedDayLabel = DAYS.find((day) => day.id === selectedDay)?.label ?? "Day";
  const selectedStudent = students.find((student) => student.id === form.studentId) ?? students[0];

  const rows = useMemo(
    () => buildDailyAssignments(students, shifts, selectedDay),
    [students, shifts, selectedDay],
  );

  const visibleRows = compactView
    ? rows.filter((row) => row.activeCount > 0 || row.unassigned.length > 0)
    : rows;

  const selectedDayShifts = useMemo(
    () =>
      shifts
        .filter((shift) => shift.day === selectedDay)
        .slice()
        .sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start)),
    [selectedDay, shifts],
  );

  const conflictRanges = useMemo(() => buildConflictRanges(rows), [rows]);
  const peakStudents = rows.reduce((max, row) => Math.max(max, row.activeCount), 0);

  function updateStudent(studentId, patch) {
    setPlanner((current) => ({
      ...current,
      students: current.students.map((student) =>
        student.id === studentId ? { ...student, ...patch } : student,
      ),
    }));
  }

  function handleSubmit(event) {
    event.preventDefault();
    setFormError("");

    const start = timeToMinutes(form.start);
    const end = timeToMinutes(form.end);

    if (!form.studentId) {
      setFormError("Choose a student.");
      return;
    }

    if (end <= start) {
      setFormError("End time must be after start time.");
      return;
    }

    setPlanner((current) => {
      const nextShift = {
        id: editingShiftId ?? createId("shift"),
        studentId: form.studentId,
        day: form.day,
        start: form.start,
        end: form.end,
      };

      return {
        ...current,
        shifts: editingShiftId
          ? current.shifts.map((shift) => (shift.id === editingShiftId ? nextShift : shift))
          : [...current.shifts, nextShift].sort(sortShifts),
      };
    });

    setSelectedDay(form.day);
    setEditingShiftId(null);
    setForm((current) => ({ ...current, day: form.day }));
  }

  function editShift(shift) {
    setEditingShiftId(shift.id);
    setForm({
      studentId: shift.studentId,
      day: shift.day,
      start: shift.start,
      end: shift.end,
    });
    setFormError("");
  }

  function deleteShift(shiftId) {
    setPlanner((current) => ({
      ...current,
      shifts: current.shifts.filter((shift) => shift.id !== shiftId),
    }));

    if (editingShiftId === shiftId) {
      setEditingShiftId(null);
      setForm(EMPTY_FORM);
    }
  }

  function clearSelectedDay() {
    if (!window.confirm(`Clear all ${selectedDayLabel} shifts?`)) return;

    setPlanner((current) => ({
      ...current,
      shifts: current.shifts.filter((shift) => shift.day !== selectedDay),
    }));
  }

  function resetPlanner() {
    if (!window.confirm("Reset roster and schedules to the starter data?")) return;

    setPlanner(STARTER_PLANNER);
    setSelectedDay(DAYS[0].id);
    setForm(EMPTY_FORM);
    setEditingShiftId(null);
    setFormError("");
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Student supervisor desk</p>
          <h1>Office Computer Planner</h1>
        </div>
        <div className="top-actions">
          <span className={`sync-pill ${syncStatus}`}>
            {SYNC_LABELS[syncStatus] ?? SYNC_LABELS.loading}
          </span>
          <button className="button ghost" type="button" onClick={resetPlanner}>
            <RotateCcw size={17} />
            Reset starter
          </button>
        </div>
      </header>

      <section className="summary-strip" aria-label="Planner summary">
        <div className="metric">
          <Users size={18} />
          <span>{students.length} students</span>
        </div>
        <div className="metric">
          <Monitor size={18} />
          <span>{COMPUTERS.length} computers</span>
        </div>
        <div className="metric">
          <Clock size={18} />
          <span>{peakStudents} peak at once</span>
        </div>
        <div className={`metric ${conflictRanges.length ? "alert" : "ok"}`}>
          {conflictRanges.length ? <AlertTriangle size={18} /> : <CheckCircle2 size={18} />}
          <span>
            {conflictRanges.length
              ? `${conflictRanges.length} conflict window${conflictRanges.length === 1 ? "" : "s"}`
              : "All seated"}
          </span>
        </div>
      </section>

      <main className="workspace">
        <aside className="sidebar" aria-label="Schedule controls">
          <section className="panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Roster</p>
                <h2>Students</h2>
              </div>
            </div>
            <div className="student-list">
              {students.map((student) => (
                <div className="student-row" key={student.id}>
                  <span
                    className="student-dot"
                    style={{ "--student-color": student.color }}
                    aria-hidden="true"
                  />
                  <label>
                    <span className="field-label">Name</span>
                    <input
                      value={student.name}
                      onChange={(event) =>
                        updateStudent(student.id, { name: event.target.value })
                      }
                    />
                  </label>
                  <label>
                    <span className="field-label">Preferred</span>
                    <select
                      value={student.preferredComputerId}
                      onChange={(event) =>
                        updateStudent(student.id, {
                          preferredComputerId: event.target.value,
                        })
                      }
                    >
                      {COMPUTERS.map((computer) => (
                        <option key={computer.id} value={computer.id}>
                          {computer.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              ))}
            </div>
          </section>

          <section className="panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Schedule entry</p>
                <h2>{editingShiftId ? "Edit Shift" : "Add Shift"}</h2>
              </div>
            </div>
            <form className="shift-form" onSubmit={handleSubmit}>
              <label>
                <span className="field-label">Student</span>
                <select
                  required
                  value={form.studentId}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, studentId: event.target.value }))
                  }
                >
                  {students.map((student) => (
                    <option key={student.id} value={student.id}>
                      {student.name}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span className="field-label">Preferred computer</span>
                <select
                  value={selectedStudent?.preferredComputerId}
                  onChange={(event) =>
                    selectedStudent &&
                    updateStudent(selectedStudent.id, {
                      preferredComputerId: event.target.value,
                    })
                  }
                >
                  {COMPUTERS.map((computer) => (
                    <option key={computer.id} value={computer.id}>
                      {computer.name}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span className="field-label">Day</span>
                <select
                  required
                  value={form.day}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, day: event.target.value }))
                  }
                >
                  {DAYS.map((day) => (
                    <option key={day.id} value={day.id}>
                      {day.label}
                    </option>
                  ))}
                </select>
              </label>

              <div className="time-fields">
                <label>
                  <span className="field-label">Start</span>
                  <input
                    required
                    type="time"
                    value={form.start}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, start: event.target.value }))
                    }
                  />
                </label>
                <label>
                  <span className="field-label">End</span>
                  <input
                    required
                    type="time"
                    value={form.end}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, end: event.target.value }))
                    }
                  />
                </label>
              </div>

              {formError && (
                <p className="form-error" role="alert">
                  {formError}
                </p>
              )}

              <div className="form-actions">
                {editingShiftId && (
                  <button
                    className="button ghost"
                    type="button"
                    onClick={() => {
                      setEditingShiftId(null);
                      setForm(EMPTY_FORM);
                      setFormError("");
                    }}
                  >
                    Cancel
                  </button>
                )}
                <button className="button primary" type="submit">
                  <Plus size={17} />
                  {editingShiftId ? "Save shift" : "Add shift"}
                </button>
              </div>
            </form>
          </section>
        </aside>

        <section className="planner" aria-label="Computer assignments">
          <div className="planner-toolbar">
            <div>
              <p className="eyebrow">Weekly seating</p>
              <h2>{selectedDayLabel}</h2>
            </div>
            <div className="toolbar-controls">
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={compactView}
                  onChange={(event) => setCompactView(event.target.checked)}
                />
                Busy times
              </label>
              <button
                className="button ghost danger"
                type="button"
                onClick={clearSelectedDay}
                disabled={selectedDayShifts.length === 0}
              >
                <Trash2 size={16} />
                Clear day
              </button>
            </div>
          </div>

          <nav className="day-tabs" aria-label="Days of week">
            {DAYS.map((day) => (
              <button
                key={day.id}
                className={day.id === selectedDay ? "active" : ""}
                type="button"
                onClick={() => setSelectedDay(day.id)}
              >
                <CalendarDays size={16} />
                {day.short}
              </button>
            ))}
          </nav>

          {conflictRanges.length > 0 && (
            <div className="conflict-banner" role="status">
              <AlertTriangle size={18} />
              <div>
                <strong>{selectedDayLabel} needs another seat during:</strong>
                <span>
                  {conflictRanges
                    .slice(0, 3)
                    .map(
                      (range) =>
                        `${formatTime(range.start)}-${formatTime(range.end)} (${range.names})`,
                    )
                    .join("; ")}
                  {conflictRanges.length > 3 ? " ..." : ""}
                </span>
              </div>
            </div>
          )}

          <div className="assignment-wrap">
            <div className="assignment-grid assignment-header" role="row">
              <div>Time</div>
              {COMPUTERS.map((computer) => (
                <div key={computer.id}>{computer.name}</div>
              ))}
              <div>Waiting</div>
            </div>

            {visibleRows.length === 0 ? (
              <div className="empty-state">
                No shifts are scheduled for {selectedDayLabel}.
              </div>
            ) : (
              visibleRows.map((row) => (
                <div
                  className={`assignment-grid assignment-row ${
                    row.unassigned.length ? "has-conflict" : ""
                  }`}
                  key={row.start}
                  role="row"
                >
                  <div className="time-cell">
                    <strong>{formatTime(row.start)}</strong>
                    <span>{formatTime(row.end)}</span>
                  </div>
                  {COMPUTERS.map((computer) => {
                    const assignedShift = row.assignments.get(computer.id);
                    const isPreferred =
                      assignedShift?.student.preferredComputerId === computer.id;

                    return (
                      <div className="seat-cell" key={computer.id}>
                        {assignedShift ? (
                          <div
                            className={`student-pill ${isPreferred ? "" : "alternate-seat"}`}
                            style={{ "--student-color": assignedShift.student.color }}
                            title={
                              isPreferred
                                ? `${assignedShift.student.name} preferred ${computer.name}`
                                : `${assignedShift.student.name} prefers ${getComputerName(
                                    assignedShift.student.preferredComputerId,
                                  )}`
                            }
                          >
                            <span>{assignedShift.student.name}</span>
                            {!isPreferred && <small>Alt</small>}
                          </div>
                        ) : (
                          <span className="open-seat">Available</span>
                        )}
                      </div>
                    );
                  })}
                  <div className="waiting-cell">
                    {row.unassigned.length ? (
                      row.unassigned.map((shift) => (
                        <span
                          className="waiting-pill"
                          key={shift.id}
                          style={{ "--student-color": shift.student.color }}
                        >
                          {shift.student.name}
                        </span>
                      ))
                    ) : (
                      <span className="open-seat">None</span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          <section className="shift-list" aria-label={`${selectedDayLabel} shifts`}>
            <div className="section-title">
              <h3>{selectedDayLabel} shifts</h3>
              <span>
                {selectedDayShifts.length} shift
                {selectedDayShifts.length === 1 ? "" : "s"}
              </span>
            </div>
            {selectedDayShifts.length === 0 ? (
              <p className="quiet">No shifts entered.</p>
            ) : (
              <div className="shift-table">
                {selectedDayShifts.map((shift) => {
                  const student = students.find((item) => item.id === shift.studentId);
                  return (
                    <div className="shift-row" key={shift.id}>
                      <span
                        className="student-dot"
                        style={{ "--student-color": student?.color ?? "#5b6777" }}
                        aria-hidden="true"
                      />
                      <strong>{getStudentName(shift.studentId, students)}</strong>
                      <span>
                        {formatTime(shift.start)}-{formatTime(shift.end)}
                      </span>
                      <span>{getComputerName(student?.preferredComputerId)}</span>
                      <div className="row-actions">
                        <button
                          className="icon-button"
                          type="button"
                          onClick={() => editShift(shift)}
                          title="Edit shift"
                          aria-label={`Edit ${getStudentName(shift.studentId, students)} shift`}
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          className="icon-button danger"
                          type="button"
                          onClick={() => deleteShift(shift.id)}
                          title="Delete shift"
                          aria-label={`Delete ${getStudentName(
                            shift.studentId,
                            students,
                          )} shift`}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </section>
      </main>

      <footer className="footer-note">
        Saved on this shared computer. Everyone connected to this app sees the latest schedule.
      </footer>
    </div>
  );
}

export default App;
