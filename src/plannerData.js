export const DAYS = [
  { id: "monday", short: "Mon", label: "Monday" },
  { id: "tuesday", short: "Tue", label: "Tuesday" },
  { id: "wednesday", short: "Wed", label: "Wednesday" },
  { id: "thursday", short: "Thu", label: "Thursday" },
  { id: "friday", short: "Fri", label: "Friday" },
  { id: "saturday", short: "Sat", label: "Saturday" },
  { id: "sunday", short: "Sun", label: "Sunday" },
];

export const COMPUTERS = [
  { id: "computer-1", name: "Computer 1" },
  { id: "computer-2", name: "Computer 2" },
  { id: "computer-3", name: "Computer 3" },
  { id: "computer-4", name: "Computer 4" },
  { id: "computer-5", name: "Computer 5" },
];

export const DEFAULT_STUDENTS = [
  {
    id: "student-1",
    name: "Student 1",
    preferredComputerId: "computer-1",
    color: "#006d77",
  },
  {
    id: "student-2",
    name: "Student 2",
    preferredComputerId: "computer-2",
    color: "#1d4ed8",
  },
  {
    id: "student-3",
    name: "Student 3",
    preferredComputerId: "computer-3",
    color: "#b45309",
  },
  {
    id: "student-4",
    name: "Student 4",
    preferredComputerId: "computer-4",
    color: "#6d28d9",
  },
  {
    id: "student-5",
    name: "Student 5",
    preferredComputerId: "computer-5",
    color: "#15803d",
  },
  {
    id: "student-6",
    name: "Student 6",
    preferredComputerId: "computer-1",
    color: "#be123c",
  },
  {
    id: "student-7",
    name: "Student 7",
    preferredComputerId: "computer-2",
    color: "#334155",
  },
];

export const DEFAULT_SHIFTS = [
  {
    id: "shift-1",
    studentId: "student-1",
    day: "monday",
    start: "09:00",
    end: "13:00",
  },
  {
    id: "shift-2",
    studentId: "student-2",
    day: "monday",
    start: "09:30",
    end: "14:00",
  },
  {
    id: "shift-3",
    studentId: "student-3",
    day: "monday",
    start: "10:00",
    end: "15:00",
  },
  {
    id: "shift-4",
    studentId: "student-4",
    day: "monday",
    start: "10:30",
    end: "15:30",
  },
  {
    id: "shift-5",
    studentId: "student-5",
    day: "monday",
    start: "11:00",
    end: "16:00",
  },
  {
    id: "shift-6",
    studentId: "student-6",
    day: "monday",
    start: "11:30",
    end: "14:30",
  },
  {
    id: "shift-7",
    studentId: "student-1",
    day: "wednesday",
    start: "08:00",
    end: "12:00",
  },
  {
    id: "shift-8",
    studentId: "student-3",
    day: "wednesday",
    start: "12:00",
    end: "16:00",
  },
  {
    id: "shift-9",
    studentId: "student-6",
    day: "friday",
    start: "09:00",
    end: "12:30",
  },
];

export const STARTER_PLANNER = {
  students: DEFAULT_STUDENTS,
  shifts: DEFAULT_SHIFTS,
};

function isKnownComputer(computerId) {
  return COMPUTERS.some((computer) => computer.id === computerId);
}

export function normalizePlanner(planner) {
  const savedStudents = Array.isArray(planner?.students) ? planner.students : [];
  const savedShifts = Array.isArray(planner?.shifts) ? planner.shifts : DEFAULT_SHIFTS;
  const savedStudentsById = new Map(savedStudents.map((student) => [student.id, student]));

  const mergedDefaultStudents = DEFAULT_STUDENTS.map((defaultStudent) => {
    const savedStudent = savedStudentsById.get(defaultStudent.id);
    if (!savedStudent) return defaultStudent;

    return {
      ...defaultStudent,
      ...savedStudent,
      preferredComputerId: isKnownComputer(savedStudent.preferredComputerId)
        ? savedStudent.preferredComputerId
        : defaultStudent.preferredComputerId,
      color: defaultStudent.color,
    };
  });

  const extraStudents = savedStudents.filter(
    (student) => !DEFAULT_STUDENTS.some((defaultStudent) => defaultStudent.id === student.id),
  );

  return {
    students: [...mergedDefaultStudents, ...extraStudents],
    shifts: savedShifts,
  };
}
