export type CalendarView = "day" | "week" | "month" | "year";

export type CalendarEvent = {
  id: string;
  title: string;
  description: string;
  startAt: string;
  endAt: string;
  color: string;
  reminderAt: string | null;
  reminderSentAt?: string | null;
  location?: string;
  allDay?: boolean;
  photoPaths?: string[];
};

export type CalendarTask = {
  id: string;
  title: string;
  dueAt: string | null;
  completed: boolean;
  color: string;
};

export const EVENT_COLORS = [
  { value: "red", label: "Коралловый" },
  { value: "green", label: "Шалфейный" },
  { value: "blue", label: "Синий" },
  { value: "yellow", label: "Песочный" },
  { value: "purple", label: "Лиловый" },
] as const;