import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  addDays, addMonths, addMinutes, endOfMonth, endOfWeek, format, eachDayOfInterval,
  eachMonthOfInterval, isSameDay, isSameMonth, isToday, startOfDay, startOfMonth,
  startOfWeek, subMonths, setHours, setMinutes
} from "date-fns";
import { ru } from "date-fns/locale";
import {
  Activity, ArrowLeft, Bell, CalendarDays, CalendarRange, Check, CheckCheck,
  ChevronDown, ChevronLeft, ChevronRight, CircleHelp, Clock3, Cloud, Coffee,
  Download, Ellipsis, Eye, EyeOff, Focus, Home, LayoutGrid, ListTodo, LockKeyhole,
  LogIn, LogOut, Mail, Menu, Moon, Plus, Search, Settings2, ShieldCheck,
  Smartphone, Sparkles, Sun, Trash2, UserRound, UserPlus, X, Zap,
  MapPin, ImagePlus, Users, History, Phone, AtSign, Cake, PanelRightClose, PanelRightOpen,
  Save, Pencil, CalendarCheck, Clock4, ClipboardList, UserCircle, ArrowUpRight
} from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import { supabase, supabaseConfigured, vapidPublicKey } from "./lib/supabase";
import { EVENT_COLORS, type CalendarEvent, type CalendarTask, type CalendarView } from "./lib/types";

type AuthMode = "login" | "signup" | "forgot" | "update";
type AppPage = "calendar" | "tasks" | "profile" | "people";
type ToastState = { message: string; kind?: "success" | "error" | "info" } | null;
type ProfileDraft = { displayName: string; phone: string; birthday: string; bio: string; avatarUrl: string };
type PersonRecord = { id: string; name: string; relationship: string; email: string; phone: string; notes: string; createdAt: string };
type VisitRecord = { id: string; personId: string | null; title: string; visitedAt: string; notes: string; personName?: string };
type EventDraft = {
  title: string;
  description: string;
  date: string;
  start: string;
  end: string;
  color: string;
  reminder: string;
  location: string;
  allDay: boolean;
  photos: File[];
  removedPhotoPaths: string[];
};

const readLocal = <T,>(key: string, fallback: T): T => {
  try {
    const stored = localStorage.getItem(key);
    return stored ? (JSON.parse(stored) as T) : fallback;
  } catch {
    return fallback;
  }
};
const uid = () => crypto.randomUUID();
const dateInput = (date: Date) => format(date, "yyyy-MM-dd");
const timeInput = (date: Date) => format(date, "HH:mm");
const rowToEvent = (row: any): CalendarEvent => ({
  id: String(row.id),
  title: row.title,
  description: row.description || "",
  startAt: row.start_at,
  endAt: row.end_at,
  color: row.color || "red",
  reminderAt: row.reminder_at || null,
  reminderSentAt: row.reminder_sent_at || null,
  location: row.location || "",
  allDay: Boolean(row.all_day),
  photoPaths: Array.isArray(row.photo_paths) ? row.photo_paths : [],
});
const rowToTask = (row: any): CalendarTask => ({
  id: String(row.id),
  title: row.title,
  dueAt: row.due_at || null,
  completed: Boolean(row.completed),
  color: row.color || "green",
});
const eventToRow = (event: CalendarEvent, userId: string) => ({
  user_id: userId,
  title: event.title,
  description: event.description,
  start_at: event.startAt,
  end_at: event.endAt,
  color: event.color,
  reminder_at: event.reminderAt,
  reminder_sent_at: null,
  location: event.location || "",
  all_day: Boolean(event.allDay),
  photo_paths: event.photoPaths || [],
});
const taskToRow = (task: CalendarTask, userId: string) => ({
  user_id: userId,
  title: task.title,
  due_at: task.dueAt,
  completed: task.completed,
  color: task.color,
});
const makeDemoEvents = (): CalendarEvent[] => {
  try {
    const saved = localStorage.getItem("calender-demo-events");
    if (saved) return JSON.parse(saved) as CalendarEvent[];
  } catch (_) {}
  const today = startOfDay(new Date());
  const at = (dayOffset: number, hour: number, minute = 0) =>
    setMinutes(setHours(addDays(today, dayOffset), hour), minute);
  return [
    { id: "sample-1", title: "Дизайн-ревью", description: "Обсудить новый макет и следующие шаги.", startAt: at(0, 10).toISOString(), endAt: at(0, 10).toISOString().replace("T10:", "T10:"), color: "green", reminderAt: null },
    { id: "sample-2", title: "Кофе с Катей", description: "Небольшой перерыв посреди дня.", startAt: at(0, 13, 30).toISOString(), endAt: at(0, 14).toISOString(), color: "yellow", reminderAt: null },
    { id: "sample-3", title: "Новая функция", description: "Сверить приоритеты и задачи на спринт.", startAt: at(1, 15).toISOString(), endAt: at(1, 16).toISOString(), color: "red", reminderAt: null },
    { id: "sample-4", title: "Планирование недели", description: "", startAt: at(3, 11).toISOString(), endAt: at(3, 11, 45).toISOString(), color: "blue", reminderAt: null },
  ].map((item) => {
    if (item.id === "sample-1") item.endAt = at(0, 11).toISOString();
    return item;
  });
};
const makeDemoTasks = (): CalendarTask[] => {
  try {
    const saved = localStorage.getItem("calender-demo-tasks");
    if (saved) return JSON.parse(saved) as CalendarTask[];
  } catch (_) {}
  return [
    { id: "task-1", title: "Ответить на письма", dueAt: null, completed: false, color: "green" },
    { id: "task-2", title: "Подготовить идеи для проекта", dueAt: null, completed: false, color: "red" },
    { id: "task-3", title: "Забронировать столик", dueAt: null, completed: true, color: "yellow" },
  ];
};
const miniDays = (date: Date) => eachDayOfInterval({
  start: startOfWeek(startOfMonth(date), { weekStartsOn: 1 }),
  end: endOfWeek(endOfMonth(date), { weekStartsOn: 1 }),
});
const humanMonth = (date: Date) => format(date, "LLLL yyyy", { locale: ru });
const humanShortDate = (date: Date) => format(date, "d MMM", { locale: ru });

function AuthScreen({
  forceRecovery,
  onRecoveryDone,
}: {
  forceRecovery: boolean;
  onRecoveryDone: () => void;
}) {
  const [mode, setMode] = useState<AuthMode>(forceRecovery ? "update" : "login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (forceRecovery) setMode("update");
  }, [forceRecovery]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    setError("");
    try {
      if (!supabase) throw new Error("Подключите Supabase, чтобы включить аккаунты.");
      if (mode === "login") {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (signInError) throw signInError;
      } else if (mode === "signup") {
        if (password.length < 8) throw new Error("Пароль должен содержать не менее 8 символов.");
        if (password !== confirmPassword) throw new Error("Пароли не совпадают.");
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { emailRedirectTo: window.location.origin + window.location.pathname },
        });
        if (signUpError) throw signUpError;
        if (!data.session) setMessage("Почти готово! Проверьте почту и подтвердите адрес, чтобы войти.");
      } else if (mode === "forgot") {
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: window.location.origin + window.location.pathname,
        });
        if (resetError) throw resetError;
        setMessage("Если аккаунт с таким адресом существует, мы отправили письмо со ссылкой для восстановления.");
      } else {
        if (password.length < 8) throw new Error("Пароль должен содержать не менее 8 символов.");
        if (password !== confirmPassword) throw new Error("Пароли не совпадают.");
        const { error: updateError } = await supabase.auth.updateUser({ password });
        if (updateError) throw updateError;
        setMessage("Пароль обновлён. Теперь можно продолжить.");
        onRecoveryDone();
      }
    } catch (err: any) {
      setError(err?.message || "Не удалось выполнить действие. Попробуйте ещё раз.");
    } finally {
      setBusy(false);
    }
  };

  const googleLogin = async () => {
    setBusy(true);
    setError("");
    try {
      if (!supabase) throw new Error("Подключите Supabase, чтобы включить Google-вход.");
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: window.location.origin + window.location.pathname },
      });
      if (oauthError) throw oauthError;
    } catch (err: any) {
      setError(err?.message || "Не удалось открыть Google.");
      setBusy(false);
    }
  };

  const titles: Record<AuthMode, string> = {
    login: "С возвращением",
    signup: "Создадим ваш ритм",
    forgot: "Восстановление доступа",
    update: "Новый пароль",
  };
  const descriptions: Record<AuthMode, string> = {
    login: "Войдите, чтобы открыть календарь и продолжить с того места, где остановились.",
    signup: "Создайте аккаунт, подтвердите почту и сохраняйте встречи и задачи в облаке. На каждом устройстве вы увидите свои планы.",
    forgot: "Отправим безопасную ссылку на вашу почту.",
    update: "Придумайте надёжный пароль для аккаунта.",
  };

  return (
    <div className="auth-page">
      <section className="auth-story">
        <a className="brand auth-brand" href="./" aria-label="Calender">
          <span className="brand-mark"><CalendarDays size={19} /></span>
          <span>calender<span className="brand-period">.</span></span>
        </a>
        <div className="auth-story-copy">
          <div className="eyebrow"><span className="status-dot" /> ВАШЕ ВРЕМЯ. ВАШИ ПРАВИЛА.</div>
          <h1>Меньше суеты.<br /><span>Больше жизни.</span></h1>
          <p>Все планы, встречи и маленькие дела — в одном месте. Спокойно, наглядно и в своём ритме.</p>
        </div>
        <div className="auth-preview">
          <div className="preview-top"><span>СЕГОДНЯ</span><span className="preview-live">● 3 дела впереди</span></div>
          <div className="preview-event"><span className="preview-line sage" /><div><small>10:00 — 10:45</small><strong>Дизайн-ревью</strong><p>Команда продукта</p></div><div className="preview-avatar">M</div></div>
          <div className="preview-event"><span className="preview-line coral" /><div><small>13:30 — 14:00</small><strong>Кофе с Катей</strong><p>Маленькая пауза</p></div><div className="preview-avatar avatar-peach">K</div></div>
          <div className="preview-event"><span className="preview-line blue" /><div><small>16:00 — 16:30</small><strong>Свободное окно</strong><p>Время для себя</p></div><div className="preview-avatar avatar-gray"><Coffee size={15} /></div></div>
          <div className="preview-footer"><span>Неделя без хаоса</span><span className="preview-spark">✳</span></div>
        </div>
        <div className="auth-story-footer"><ShieldCheck size={15} /> Ваши данные принадлежат только вам.</div>
      </section>

      <section className="auth-form-side">
        <div className="auth-form-wrap">
          <div className="mobile-auth-brand brand"><span className="brand-mark"><CalendarDays size={19} /></span><span>calender<span className="brand-period">.</span></span></div>
          <div className="auth-heading">
            <div className="auth-kicker">{mode === "update" ? "БЕЗОПАСНОСТЬ АККАУНТА" : "ВАШЕ ПРОСТРАНСТВО"}</div>
            <h2>{titles[mode]}</h2>
            <p>{descriptions[mode]}</p>
          </div>
          {(mode === "login" || mode === "signup") && (
            <>
              <button className="google-button" type="button" disabled={busy} onClick={googleLogin}>
                <span className="google-g">G</span> {mode === "signup" ? "Создать аккаунт через Google" : "Продолжить с Google"}
              </button>
              <p className="google-explainer">{mode === "signup" ? "Google подтвердит ваш адрес и создаст профиль Calender без отдельного пароля." : "Впервые в Calender? Первый вход через Google автоматически создаст аккаунт."}</p>
              <div className="auth-divider"><span />или с помощью почты<span /></div>
            </>
          )}
          <form className="auth-form" onSubmit={submit}>
            {mode !== "update" && (
              <label className="field-label">Электронная почта
                <span className="input-shell"><Mail size={17} /><input autoComplete="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required /></span>
              </label>
            )}
            {mode !== "forgot" && (
              <label className="field-label">{mode === "update" ? "Новый пароль" : "Пароль"}
                <span className="input-shell"><LockKeyhole size={17} /><input autoComplete={mode === "signup" || mode === "update" ? "new-password" : "current-password"} type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder={mode === "login" ? "Ваш пароль" : "Не менее 8 символов"} minLength={mode === "signup" || mode === "update" ? 8 : undefined} required /><button className="input-icon-button" type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? "Скрыть пароль" : "Показать пароль"}>{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button></span>
              </label>
            )}
            {(mode === "signup" || mode === "update") && (
              <label className="field-label">{mode === "update" ? "Повторите пароль" : "Повторите пароль"}
                <span className="input-shell"><LockKeyhole size={17} /><input autoComplete="new-password" type={showPassword ? "text" : "password"} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Введите пароль ещё раз" minLength={8} required /></span>
              </label>
            )}
            {mode === "login" && <button type="button" className="text-action forgot-link" onClick={() => { setMode("forgot"); setMessage(""); setError(""); }}>Забыли пароль?</button>}
            {error && <div className="form-message error-message"><X size={15} />{error}</div>}
            {message && <div className="form-message success-message"><Check size={15} />{message}</div>}
            <button className="primary-button auth-submit" disabled={busy} type="submit">
              {busy ? <span className="spinner" /> : null}
              {mode === "login" ? "Войти в аккаунт" : mode === "signup" ? "Создать аккаунт" : mode === "forgot" ? "Отправить ссылку" : "Сохранить новый пароль"}
              {!busy && <ChevronRight size={17} />}
            </button>
          </form>
          <div className="auth-switch">
            {mode === "login" && <>Впервые здесь? <button className="text-action" onClick={() => { setMode("signup"); setMessage(""); setError(""); }}>Создать аккаунт</button></>}
            {mode === "signup" && <>Уже есть аккаунт? <button className="text-action" onClick={() => { setMode("login"); setMessage(""); setError(""); }}>Войти</button></>}
            {mode === "forgot" && <button className="text-action back-action" onClick={() => { setMode("login"); setMessage(""); setError(""); }}><ArrowLeft size={14} /> Вернуться ко входу</button>}
            {mode === "update" && !forceRecovery && <button className="text-action back-action" onClick={() => setMode("login")}><ArrowLeft size={14} /> Вернуться ко входу</button>}
          </div>
          <p className="auth-legal">{mode === "signup" ? "При регистрации мы создадим ваш личный календарь. Подтверждение почты нужно для защиты аккаунта и восстановления доступа." : mode === "forgot" ? "Для безопасности мы не раскрываем, существует ли аккаунт с указанной почтой." : "Продолжая, вы подтверждаете, что ознакомились с условиями использования и политикой конфиденциальности."} <a href="./terms.html" target="_blank" rel="noreferrer">Условия</a> · <a href="./privacy.html" target="_blank" rel="noreferrer">Конфиденциальность</a></p>
        </div>
      </section>
    </div>
  );
}

function EventModal({
  event,
  date,
  onClose,
  onSave,
  onDelete,
}: {
  event: CalendarEvent | null;
  date: Date;
  onClose: () => void;
  onSave: (draft: EventDraft, existing: CalendarEvent | null) => Promise<void>;
  onDelete: (event: CalendarEvent) => Promise<void>;
}) {
  const initialDate = event ? new Date(event.startAt) : setHours(setMinutes(startOfDay(date), 0), 10);
  const [title, setTitle] = useState(event?.title || "");
  const [description, setDescription] = useState(event?.description || "");
  const [day, setDay] = useState(dateInput(initialDate));
  const [start, setStart] = useState(timeInput(initialDate));
  const [end, setEnd] = useState(event ? timeInput(new Date(event.endAt)) : timeInput(addMinutes(initialDate, 45)));
  const [color, setColor] = useState(event?.color || "red");
  const [reminder, setReminder] = useState(event ? (event.reminderAt ? String(Math.max(0, Math.round((new Date(event.startAt).getTime() - new Date(event.reminderAt).getTime()) / 60000))) : "0") : "10");
  const [location, setLocation] = useState(event?.location || "");
  const [allDay, setAllDay] = useState(Boolean(event?.allDay));
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [photoPreviews, setPhotoPreviews] = useState<{ file: File; url: string }[]>([]);
  const [savedPhotoUrls, setSavedPhotoUrls] = useState<{ path: string; url: string }[]>([]);
  const [removedPhotoPaths, setRemovedPhotoPaths] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState("");
  const photoPathsKey = (event?.photoPaths || []).join("|");

  useEffect(() => {
    let active = true;
    const paths = (event?.photoPaths || []).filter((path) => !removedPhotoPaths.includes(path));
    if (!supabase || !paths.length) {
      setSavedPhotoUrls([]);
      return () => { active = false; };
    }
    Promise.all(paths.map(async (path) => {
      const { data, error } = await supabase!.storage.from("event-photos").createSignedUrl(path, 3600);
      if (error) return null;
      return data?.signedUrl ? { path, url: data.signedUrl } : null;
    })).then((results) => {
      if (active) setSavedPhotoUrls(results.filter((item): item is { path: string; url: string } => Boolean(item)));
    }).catch((error) => console.warn("Could not create event photo preview URLs:", error));
    return () => { active = false; };
  }, [photoPathsKey, removedPhotoPaths.join("|")]);

  useEffect(() => {
    const previews = photoFiles.map((file) => ({ file, url: URL.createObjectURL(file) }));
    setPhotoPreviews(previews);
    return () => previews.forEach((preview) => URL.revokeObjectURL(preview.url));
  }, [photoFiles]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setLocalError("Добавьте название события.");
      return;
    }
    const startDate = new Date(day + "T" + (allDay ? "00:00" : start) + ":00");
    let endDate = new Date(day + "T" + (allDay ? "23:59" : end) + ":00");
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      setLocalError("Проверьте дату и время.");
      return;
    }
    if (endDate <= startDate) endDate = addDays(endDate, 1);
    setBusy(true);
    setLocalError("");
    const minutes = Number(reminder);
    const reminderAt = minutes > 0 ? new Date(startDate.getTime() - minutes * 60000).toISOString() : null;
    try {
      await onSave({
        title: title.trim(),
        description: description.trim(),
        date: day,
        start,
        end: format(endDate, "HH:mm"),
        color,
        reminder: String(minutes),
        location: location.trim(),
        allDay,
        photos: photoFiles,
        removedPhotoPaths,
      }, event ? {
        ...event,
        startAt: startDate.toISOString(),
        endAt: endDate.toISOString(),
        reminderAt,
        location: location.trim(),
        allDay,
      } : null);
      onClose();
    } catch (err: any) {
      setLocalError(err?.message || "Не удалось сохранить событие.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!event) return;
    setBusy(true);
    try {
      await onDelete(event);
      onClose();
    } catch (err: any) {
      setLocalError(err?.message || "Не удалось удалить событие.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="event-modal" role="dialog" aria-modal="true" aria-labelledby="event-modal-title">
        <div className="modal-header">
          <div><div className="auth-kicker">{event ? "РЕДАКТИРОВАНИЕ" : "НОВЫЙ ПЛАН"}</div><h2 id="event-modal-title">{event ? "Изменить событие" : "Что запланируем?"}</h2></div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Закрыть"><X size={19} /></button>
        </div>
        <form className="event-form" onSubmit={submit}>
          <label className="field-label">Название
            <input className="plain-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Например, встреча с командой" maxLength={120} autoFocus required />
          </label>
          <div className="form-two-cols">
            <label className="field-label">Дата<input className="plain-input" type="date" value={day} onChange={(e) => setDay(e.target.value)} required /></label>
            <label className="field-label">Напоминание
              <select className="plain-input" value={reminder} onChange={(e) => setReminder(e.target.value)}>
                <option value="0">Без напоминания</option><option value="5">За 5 минут</option><option value="10">За 10 минут</option><option value="15">За 15 минут</option><option value="30">За 30 минут</option><option value="60">За 1 час</option><option value="1440">За день</option>
              </select>
            </label>
          </div>
          <label className="all-day-toggle"><input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} /><CalendarCheck size={16} /><span>Событие на весь день</span></label>
          {!allDay && <div className="form-two-cols">
            <label className="field-label">Начало<input className="plain-input" type="time" value={start} onChange={(e) => setStart(e.target.value)} required /></label>
            <label className="field-label">Окончание<input className="plain-input" type="time" value={end} onChange={(e) => setEnd(e.target.value)} required /></label>
          </div>}
          <label className="field-label">Местоположение <span className="optional-label">необязательно</span><span className="input-with-icon"><MapPin size={16} /><input className="plain-input" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Адрес, кафе или ссылка на место" maxLength={500} /></span></label>
          <label className="field-label">Заметка <span className="optional-label">необязательно</span><textarea className="plain-input note-input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Контекст, ссылка, что не забыть…" maxLength={1200} rows={3} /></label>
          <div className="photo-attachments">
            <div className="field-label"><span>Фотографии <span className="optional-label">до 5 МБ на фото</span></span>
              <label className="photo-upload-button"><ImagePlus size={16} /> Добавить фото<input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(e) => {
                const incoming = Array.from(e.target.files || []);
                const valid = incoming.filter((file) => ["image/jpeg", "image/png", "image/webp"].includes(file.type) && file.size <= 5 * 1024 * 1024);
                if (valid.length !== incoming.length) setLocalError("Поддерживаются JPG, PNG и WebP размером до 5 МБ каждый.");
                if (valid.length) setPhotoFiles((current) => [...current, ...valid].slice(0, 8));
                e.currentTarget.value = "";
              }} /></label>
            </div>
            {(savedPhotoUrls.length > 0 || photoPreviews.length > 0) && <div className="photo-preview-grid">
              {savedPhotoUrls.map((photo) => <div className="photo-preview" key={photo.path}><img src={photo.url} alt="Прикреплённая фотография" /><button type="button" aria-label="Убрать фото" onClick={() => { setRemovedPhotoPaths((current) => [...current, photo.path]); setSavedPhotoUrls((current) => current.filter((item) => item.path !== photo.path)); }}><X size={13} /></button></div>)}
              {photoPreviews.map((photo, index) => <div className="photo-preview" key={photo.url}><img src={photo.url} alt={photo.file.name} /><button type="button" aria-label="Убрать фото" onClick={() => setPhotoFiles((current) => current.filter((_, i) => i !== index))}><X size={13} /></button></div>)}
            </div>}
            <p className="attachment-hint">Фотографии будут храниться в приватном облачном хранилище и доступны только владельцу события.</p>
          </div>
          <div className="field-label">Цвет события
            <div className="color-picker">{EVENT_COLORS.map((c) => <button key={c.value} type="button" className={"color-choice color-" + c.value + (color === c.value ? " selected" : "")} aria-label={c.label} title={c.label} onClick={() => setColor(c.value)} />)}</div>
          </div>
          {localError && <div className="form-message error-message"><X size={15} />{localError}</div>}
          <div className="modal-actions">
            {event && <button className="delete-button" type="button" disabled={busy} onClick={remove}><Trash2 size={16} /> Удалить</button>}
            <button className="secondary-button" type="button" disabled={busy} onClick={onClose}>Отмена</button>
            <button className="primary-button" type="submit" disabled={busy}>{busy ? <span className="spinner" /> : <Check size={16} />} Сохранить</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(!supabaseConfigured);
  const [forceRecovery, setForceRecovery] = useState(false);
  const [view, setView] = useState<CalendarView>("week");
  const [activePage, setActivePage] = useState<AppPage>("calendar");
  const [showInsightsPanel, setShowInsightsPanel] = useState(() => localStorage.getItem("calender-show-insights") !== "false");
  const [profile, setProfile] = useState<ProfileDraft>(() => readLocal("calender-demo-profile", { displayName: "", phone: "", birthday: "", bio: "", avatarUrl: "" }));
  const [people, setPeople] = useState<PersonRecord[]>(() => readLocal("calender-demo-people", []));
  const [visitHistory, setVisitHistory] = useState<VisitRecord[]>(() => readLocal("calender-demo-visits", []));
  const [profileBusy, setProfileBusy] = useState(false);
  const [personDraft, setPersonDraft] = useState({ name: "", relationship: "", email: "", phone: "", notes: "" });
  const [editingPerson, setEditingPerson] = useState<PersonRecord | null>(null);
  const [visitDraft, setVisitDraft] = useState({ personId: "", title: "", visitedAt: format(new Date(), "yyyy-MM-dd'T'HH:mm"), notes: "" });
  const [focusDate, setFocusDate] = useState(startOfDay(new Date()));
  const [events, setEvents] = useState<CalendarEvent[]>(() => supabaseConfigured ? [] : makeDemoEvents());
  const [tasks, setTasks] = useState<CalendarTask[]>(() => supabaseConfigured ? [] : makeDemoTasks());
  const [loadingData, setLoadingData] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [taskInput, setTaskInput] = useState("");
  const [toast, setToast] = useState<ToastState>(null);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const demoMode = !supabaseConfigured;

  const notify = useCallback((message: string, kind: "success" | "error" | "info" = "info") => {
    setToast({ message, kind });
    window.setTimeout(() => setToast(null), 4300);
  }, []);

  useEffect(() => {
    if (!supabase) {
      setAuthReady(true);
      return;
    }
    let active = true;
    supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error) console.warn("Calender session check failed:", error.message);
      setSession(data.session);
      setAuthReady(true);
    }).catch((error) => {
      console.error("Calender auth initialization failed:", error);
      if (active) setAuthReady(true);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession);
      if (event === "PASSWORD_RECOVERY") setForceRecovery(true);
      if (event === "SIGNED_OUT") setForceRecovery(false);
    });
    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const client = supabase;
    if (!session?.user.id || !client) return;
    let active = true;
    const loadCloudData = async () => {
      setLoadingData(true);
      try {
        const [eventResult, taskResult, pushResult, profileResult, peopleResult, visitResult] = await Promise.all([
          client.from("events").select("id,title,description,start_at,end_at,color,reminder_at,reminder_sent_at,location,all_day,photo_paths").order("start_at", { ascending: true }).limit(500),
          client.from("tasks").select("id,title,due_at,completed,color").order("created_at", { ascending: false }).limit(200),
          client.from("push_subscriptions").select("endpoint").limit(10),
          client.from("profiles").select("user_id,display_name,phone,birthday,bio,avatar_url").maybeSingle(),
          client.from("people").select("id,name,relationship,email,phone,notes,created_at").order("name", { ascending: true }).limit(500),
          client.from("visit_history").select("id,person_id,title,visited_at,notes").order("visited_at", { ascending: false }).limit(200),
        ]);
        if (!active) return;
        if (eventResult.error) throw eventResult.error;
        if (taskResult.error) throw taskResult.error;
        if (profileResult.error) throw profileResult.error;
        if (peopleResult.error) throw peopleResult.error;
        if (visitResult.error) throw visitResult.error;
        const cloudPeople: PersonRecord[] = (peopleResult.data || []).map((row: any) => ({ id: row.id, name: row.name, relationship: row.relationship || "", email: row.email || "", phone: row.phone || "", notes: row.notes || "", createdAt: row.created_at }));
        setEvents((eventResult.data || []).map(rowToEvent));
        setTasks((taskResult.data || []).map(rowToTask));
        setPushEnabled(Boolean(pushResult.data?.length));
        const cloudProfile = profileResult.data as any;
        setProfile({
          displayName: cloudProfile?.display_name || session.user.user_metadata?.full_name || session.user.user_metadata?.name || "",
          phone: cloudProfile?.phone || "", birthday: cloudProfile?.birthday || "",
          bio: cloudProfile?.bio || "", avatarUrl: cloudProfile?.avatar_url || session.user.user_metadata?.avatar_url || session.user.user_metadata?.picture || "",
        });
        setPeople(cloudPeople);
        setVisitHistory((visitResult.data || []).map((row: any) => ({
          id: row.id, personId: row.person_id || null, title: row.title, visitedAt: row.visited_at, notes: row.notes || "",
          personName: cloudPeople.find((person) => person.id === row.person_id)?.name || "",
        })));
      } catch (error: any) {
        if (active) {
          console.error("Calender data load failed:", error);
          notify("Не удалось загрузить облачные данные. Проверьте схему БД и RLS.", "error");
        }
      } finally {
        if (active) setLoadingData(false);
      }
    };
    void loadCloudData();
    // Refresh this user's own rows whenever another device changes the cloud calendar.
    const channel = client
      .channel("calender-data-" + session.user.id)
      .on("postgres_changes", { event: "*", schema: "public", table: "events" }, () => { void loadCloudData(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, () => { void loadCloudData(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, () => { void loadCloudData(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "people" }, () => { void loadCloudData(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "visit_history" }, () => { void loadCloudData(); })
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.warn("Calender realtime channel status:", status);
        }
      });
    return () => {
      active = false;
      void client.removeChannel(channel);
    };
  }, [session?.user.id, notify]);

  useEffect(() => {
    if (!demoMode) return;
    try {
      localStorage.setItem("calender-demo-events", JSON.stringify(events));
      localStorage.setItem("calender-demo-tasks", JSON.stringify(tasks));
      localStorage.setItem("calender-demo-profile", JSON.stringify(profile));
      localStorage.setItem("calender-demo-people", JSON.stringify(people));
      localStorage.setItem("calender-demo-visits", JSON.stringify(visitHistory));
      localStorage.setItem("calender-show-insights", String(showInsightsPanel));
    } catch (error) {
      console.warn("Could not persist demo data", error);
    }
  }, [events, tasks, demoMode, profile, people, visitHistory, showInsightsPanel]);

  useEffect(() => {
    try { localStorage.setItem("calender-show-insights", String(showInsightsPanel)); } catch (_) {}
  }, [showInsightsPanel]);

  useEffect(() => {
    const onInstall = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event);
    };
    window.addEventListener("beforeinstallprompt", onInstall as EventListener);
    return () => window.removeEventListener("beforeinstallprompt", onInstall as EventListener);
  }, []);

  const visibleEvents = useMemo(() => {
    const query = searchValue.trim().toLowerCase();
    return [...events]
      .filter((event) => !query || (event.title + " " + event.description).toLowerCase().includes(query))
      .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
  }, [events, searchValue]);

  const selectedDayEvents = (date: Date) => visibleEvents.filter((event) => isSameDay(new Date(event.startAt), date));
  const weekDays = useMemo(() => eachDayOfInterval({
    start: startOfWeek(focusDate, { weekStartsOn: 1 }),
    end: endOfWeek(focusDate, { weekStartsOn: 1 }),
  }), [focusDate]);
  const monthDays = useMemo(() => miniDays(focusDate), [focusDate]);
  const monthGridDays = useMemo(() => eachDayOfInterval({
    start: startOfWeek(startOfMonth(focusDate), { weekStartsOn: 1 }),
    end: endOfWeek(endOfMonth(focusDate), { weekStartsOn: 1 }),
  }), [focusDate]);
  const yearMonths = useMemo(() => eachMonthOfInterval({
    start: new Date(focusDate.getFullYear(), 0, 1),
    end: new Date(focusDate.getFullYear(), 11, 31),
  }), [focusDate]);

  const openNewEvent = (date: Date = focusDate) => {
    setFocusDate(startOfDay(date));
    setEditingEvent(null);
    setModalOpen(true);
  };
  const openEditEvent = (event: CalendarEvent) => {
    setEditingEvent(event);
    setModalOpen(true);
  };

  const saveEvent = async (draft: EventDraft, existing: CalendarEvent | null) => {
    const startDate = new Date(draft.date + "T" + (draft.allDay ? "00:00" : draft.start) + ":00");
    let endDate = new Date(draft.date + "T" + (draft.allDay ? "23:59" : draft.end) + ":00");
    if (endDate <= startDate) endDate = addDays(endDate, 1);
    const startAt = startDate.toISOString();
    const minutes = Number(draft.reminder);
    const existingPhotoPaths = (existing?.photoPaths || []).filter((path) => !draft.removedPhotoPaths.includes(path));
    const uploadedPhotoPaths: string[] = [];
    if (draft.photos.length && (!supabase || !session?.user.id)) {
      throw new Error("Чтобы сохранить фотографии, войдите в облачный аккаунт. В демо-режиме можно сохранять события без вложений.");
    }
    if (draft.photos.length > 8) throw new Error("Можно прикрепить не более 8 фотографий к событию.");
    if (draft.photos.some((photo) => photo.size > 5 * 1024 * 1024 || !["image/jpeg", "image/png", "image/webp"].includes(photo.type))) {
      throw new Error("Фотографии должны быть в JPG, PNG или WebP размером до 5 МБ.");
    }
    const eventId = existing?.id || uid();
    if (supabase && session?.user.id) {
      for (const photo of draft.photos) {
        const safeName = photo.name.normalize("NFKD").replace(/[^a-zA-Z0-9._-]/g, "-").slice(-80) || "photo";
        const path = session.user.id + "/" + eventId + "/" + uid() + "-" + safeName;
        const { error: uploadError } = await supabase.storage.from("event-photos").upload(path, photo, { contentType: photo.type, upsert: false });
        if (uploadError) {
          if (uploadedPhotoPaths.length) await supabase.storage.from("event-photos").remove(uploadedPhotoPaths);
          console.error("Calender photo upload failed:", uploadError);
          throw new Error("Не удалось загрузить фотографию. Проверьте миграцию и права хранилища.");
        }
        uploadedPhotoPaths.push(path);
      }
    }
    const event: CalendarEvent = {
      id: eventId,
      title: draft.title,
      description: draft.description,
      startAt,
      endAt: endDate.toISOString(),
      color: draft.color,
      reminderAt: minutes > 0 ? new Date(startDate.getTime() - minutes * 60000).toISOString() : null,
      reminderSentAt: null,
      location: draft.location,
      allDay: draft.allDay,
      photoPaths: [...existingPhotoPaths, ...uploadedPhotoPaths],
    };
    if (supabase && session?.user.id) {
      const payload = eventToRow(event, session.user.id);
      const result = existing
        ? await supabase.from("events").update(payload).eq("id", existing.id).select().single()
        : await supabase.from("events").insert(payload).select().single();
      if (result.error) {
        if (uploadedPhotoPaths.length) await supabase.storage.from("event-photos").remove(uploadedPhotoPaths);
        console.error("Calender event save failed:", result.error);
        throw new Error("Событие не сохранено. Проверьте, применена ли миграция и настроены ли RLS-политики.");
      }
      if (draft.removedPhotoPaths.length) {
        const { error: removeError } = await supabase.storage.from("event-photos").remove(draft.removedPhotoPaths);
        if (removeError) console.warn("Could not remove event photos:", removeError.message);
      }
      const saved = rowToEvent(result.data);
      setEvents((current) => existing ? current.map((item) => item.id === saved.id ? saved : item) : current.some((item) => item.id === saved.id) ? current.map((item) => item.id === saved.id ? saved : item) : [...current, saved]);
    } else {
      setEvents((current) => existing ? current.map((item) => item.id === event.id ? event : item) : [...current, event]);
    }
    notify(existing ? "Изменения сохранены" : "Событие добавлено в календарь", "success");
  };

  const deleteEvent = async (event: CalendarEvent) => {
    if (supabase && session?.user.id) {
      const { error } = await supabase.from("events").delete().eq("id", event.id);
      if (error) {
        console.error("Calender event delete failed:", error);
        throw new Error("Событие не удалено. Попробуйте ещё раз.");
      }
    }
    setEvents((current) => current.filter((item) => item.id !== event.id));
    notify("Событие удалено", "success");
  };

  const addTask = async (e: FormEvent) => {
    e.preventDefault();
    const title = taskInput.trim();
    if (!title) return;
    const task: CalendarTask = { id: uid(), title, dueAt: null, completed: false, color: "green" };
    if (supabase && session?.user.id) {
      const { data, error } = await supabase.from("tasks").insert(taskToRow(task, session.user.id)).select().single();
      if (error) {
        console.error("Calender task create failed:", error);
        notify("Не удалось создать задачу. Проверьте подключение.", "error");
        return;
      }
      setTasks((current) => current.some((item) => item.id === data.id) ? current.map((item) => item.id === data.id ? rowToTask(data) : item) : [rowToTask(data), ...current]);
    } else {
      setTasks((current) => [task, ...current]);
    }
    setTaskInput("");
    notify("Задача добавлена", "success");
  };

  const toggleTask = async (task: CalendarTask) => {
    const next = { ...task, completed: !task.completed };
    if (supabase && session?.user.id) {
      const { error } = await supabase.from("tasks").update({ completed: next.completed }).eq("id", task.id);
      if (error) {
        console.error("Calender task update failed:", error);
        notify("Не удалось обновить задачу.", "error");
        return;
      }
    }
    setTasks((current) => current.map((item) => item.id === task.id ? next : item));
  };

  const deleteTask = async (task: CalendarTask) => {
    if (supabase && session?.user.id) {
      const { error } = await supabase.from("tasks").delete().eq("id", task.id);
      if (error) {
        notify("Не удалось удалить задачу.", "error");
        return;
      }
    }
    setTasks((current) => current.filter((item) => item.id !== task.id));
    notify("Задача удалена", "success");
  };

  const saveProfile = async (e: FormEvent) => {
    e.preventDefault();
    setProfileBusy(true);
    try {
      const payload = {
        user_id: session?.user.id,
        display_name: profile.displayName.trim().slice(0, 100),
        phone: profile.phone.trim().slice(0, 40),
        birthday: profile.birthday || null,
        bio: profile.bio.trim().slice(0, 1000),
        avatar_url: profile.avatarUrl.trim().slice(0, 1000),
      };
      if (supabase && session?.user.id) {
        const { error } = await supabase.from("profiles").upsert(payload, { onConflict: "user_id" });
        if (error) throw error;
        const { error: metadataError } = await supabase.auth.updateUser({ data: { full_name: payload.display_name } });
        if (metadataError) console.warn("Calender profile auth metadata update failed:", metadataError.message);
      }
      setProfile((current) => ({ ...current, displayName: payload.display_name, phone: payload.phone, birthday: payload.birthday || "", bio: payload.bio }));
      notify("Профиль сохранён", "success");
    } catch (error: any) {
      console.error("Calender profile save failed:", error);
      notify(error?.message || "Не удалось сохранить профиль.", "error");
    } finally {
      setProfileBusy(false);
    }
  };

  const savePerson = async (e: FormEvent) => {
    e.preventDefault();
    const name = personDraft.name.trim();
    if (!name) return;
    const payload = { name, relationship: personDraft.relationship.trim(), email: personDraft.email.trim(), phone: personDraft.phone.trim(), notes: personDraft.notes.trim() };
    try {
      if (supabase && session?.user.id) {
        const query = editingPerson
          ? supabase.from("people").update(payload).eq("id", editingPerson.id).select().single()
          : supabase.from("people").insert({ ...payload, user_id: session.user.id }).select().single();
        const { data, error } = await query;
        if (error) throw error;
        const saved: PersonRecord = { id: data.id, ...payload, createdAt: data.created_at };
        setPeople((current) => editingPerson ? current.map((person) => person.id === editingPerson.id ? saved : person) : [...current, saved].sort((a,b) => a.name.localeCompare(b.name, "ru")));
      } else {
        const saved: PersonRecord = { id: editingPerson?.id || uid(), ...payload, createdAt: editingPerson?.createdAt || new Date().toISOString() };
        setPeople((current) => editingPerson ? current.map((person) => person.id === editingPerson.id ? saved : person) : [...current, saved].sort((a,b) => a.name.localeCompare(b.name, "ru")));
      }
      setPersonDraft({ name: "", relationship: "", email: "", phone: "", notes: "" });
      setEditingPerson(null);
      notify(editingPerson ? "Контакт обновлён" : "Человек добавлен в список", "success");
    } catch (error: any) {
      console.error("Calender person save failed:", error);
      notify(error?.message || "Не удалось сохранить контакт.", "error");
    }
  };

  const deletePerson = async (person: PersonRecord) => {
    if (!window.confirm("Удалить контакт «" + person.name + "»? Записи истории останутся без привязки к нему.")) return;
    try {
      if (supabase && session?.user.id) {
        const { error } = await supabase.from("people").delete().eq("id", person.id);
        if (error) throw error;
      }
      setPeople((current) => current.filter((item) => item.id !== person.id));
      setVisitHistory((current) => current.map((visit) => visit.personId === person.id ? { ...visit, personId: null, personName: "" } : visit));
      if (editingPerson?.id === person.id) {
        setEditingPerson(null);
        setPersonDraft({ name: "", relationship: "", email: "", phone: "", notes: "" });
      }
      notify("Контакт удалён", "success");
    } catch (error: any) {
      console.error("Calender person delete failed:", error);
      notify(error?.message || "Не удалось удалить контакт.", "error");
    }
  };

  const saveVisit = async (e: FormEvent) => {
    e.preventDefault();
    const title = visitDraft.title.trim();
    if (!title) return;
    const visitedAt = new Date(visitDraft.visitedAt).toISOString();
    try {
      if (supabase && session?.user.id) {
        const { data, error } = await supabase.from("visit_history").insert({
          user_id: session.user.id, person_id: visitDraft.personId || null, title, visited_at: visitedAt, notes: visitDraft.notes.trim(),
        }).select().single();
        if (error) throw error;
        const personName = people.find((person) => person.id === visitDraft.personId)?.name || "";
        setVisitHistory((current) => [{ id: data.id, personId: data.person_id, title: data.title, visitedAt: data.visited_at, notes: data.notes || "", personName }, ...current]);
      } else {
        const personName = people.find((person) => person.id === visitDraft.personId)?.name || "";
        setVisitHistory((current) => [{ id: uid(), personId: visitDraft.personId || null, title, visitedAt, notes: visitDraft.notes.trim(), personName }, ...current]);
      }
      setVisitDraft({ personId: "", title: "", visitedAt: format(new Date(), "yyyy-MM-dd'T'HH:mm"), notes: "" });
      notify("Запись добавлена в историю", "success");
    } catch (error: any) {
      console.error("Calender visit history save failed:", error);
      notify(error?.message || "Не удалось записать историю.", "error");
    }
  };

  const deleteVisit = async (visit: VisitRecord) => {
    try {
      if (supabase && session?.user.id) {
        const { error } = await supabase.from("visit_history").delete().eq("id", visit.id);
        if (error) throw error;
      }
      setVisitHistory((current) => current.filter((item) => item.id !== visit.id));
      notify("Запись удалена", "success");
    } catch (error: any) {
      notify(error?.message || "Не удалось удалить запись.", "error");
    }
  };

  const navigateDate = (amount: number) => {
    if (view === "month") setFocusDate((date) => startOfDay(addMonths(date, amount)));
    else if (view === "year") setFocusDate((date) => startOfDay(addMonths(date, amount * 12)));
    else setFocusDate((date) => startOfDay(addDays(date, amount * (view === "week" ? 7 : 1))));
  };

  const enablePush = async () => {
    if (!supabase || !session?.user.id) {
      notify("Push-уведомления появятся после подключения облачного аккаунта.", "info");
      return;
    }
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      notify("Этот браузер не поддерживает push. Попробуйте Safari или Chrome последней версии.", "error");
      return;
    }
    const isStandalone = window.matchMedia("(display-mode: standalone)").matches || Boolean((navigator as any).standalone);
    const isAppleMobile = /iphone|ipad|ipod/i.test(navigator.userAgent);
    if (isAppleMobile && !isStandalone) {
      notify("На iPhone сначала нажмите «Поделиться» → «На экран Домой», затем откройте Calender с иконки.", "info");
      return;
    }
    if (!vapidPublicKey) {
      notify("Добавьте VITE_VAPID_PUBLIC_KEY и настройте отправку push на сервере.", "info");
      return;
    }
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        notify("Разрешение на уведомления не выдано.", "info");
        return;
      }
      const registration = await navigator.serviceWorker.register(import.meta.env.BASE_URL + "sw.js");
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        const keyBytes = Uint8Array.from(atob(vapidPublicKey.replace(/-/g, "+").replace(/_/g, "/")), (char) => char.charCodeAt(0));
        subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes });
      }
      const { error } = await supabase.from("push_subscriptions").upsert({
        user_id: session.user.id,
        endpoint: subscription.endpoint,
        subscription: subscription.toJSON(),
      }, { onConflict: "endpoint" });
      if (error) throw error;
      setPushEnabled(true);
      notify("Уведомления включены на этом устройстве", "success");
    } catch (error: any) {
      console.error("Calender push subscription failed:", error);
      notify(error?.message || "Не удалось включить уведомления. Проверьте настройки push-сервера.", "error");
    }
  };

  const installApp = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      setDeferredPrompt(null);
    } else {
      notify("На iPhone: откройте меню «Поделиться» в Safari → «На экран Домой».", "info");
    }
  };

  const signOut = async () => {
    if (supabase) {
      const { error } = await supabase.auth.signOut();
      if (error) notify("Не удалось завершить сеанс.", "error");
    }
  };

  const completedCount = tasks.filter((task) => task.completed).length;
  const nextEvents = visibleEvents.filter((event) => new Date(event.endAt).getTime() >= Date.now()).slice(0, 3);
  const viewLabels: { value: CalendarView; label: string }[] = [
    { value: "day", label: "День" }, { value: "week", label: "Неделя" }, { value: "month", label: "Месяц" }, { value: "year", label: "Год" },
  ];

  if (!authReady) {
    return <div className="loading-screen"><span className="loading-orbit" /><span>Подготавливаем ваше пространство…</span></div>;
  }
  if (supabaseConfigured && (!session || forceRecovery)) {
    return <AuthScreen forceRecovery={forceRecovery} onRecoveryDone={() => setForceRecovery(false)} />;
  }

  return (
    <div className={"app-shell" + (theme === "dark" ? " dark-theme" : "")}>
      {toast && <div className={"toast toast-" + (toast.kind || "info")} role="status"><span className="toast-icon">{toast.kind === "success" ? <Check size={16} /> : toast.kind === "error" ? <X size={16} /> : <Bell size={16} />}</span><span>{toast.message}</span><button onClick={() => setToast(null)} aria-label="Закрыть уведомление"><X size={15} /></button></div>}
      {demoMode && <div className="demo-banner"><Zap size={13} /> Демо-режим · данные сохраняются только в этом браузере <button onClick={() => notify("Скоро: подключите Supabase по инструкции в README, чтобы включить Google-вход и облачную синхронизацию.", "info")}>Подключить облако <ChevronRight size={13} /></button></div>}
      <div className="app-layout">
        <aside className="icon-rail">
          <button className="rail-logo" aria-label="Calender"><CalendarDays size={20} /></button>
          <div className="rail-divider" />
          <button className="rail-button active" aria-label="Календарь" title="Календарь"><CalendarRange size={18} /></button>
          <button className="rail-button" aria-label="Задачи" title="Задачи" onClick={() => document.getElementById("tasks-panel")?.scrollIntoView({ behavior: "smooth" })}><ListTodo size={18} /></button>
          <button className="rail-button" aria-label="Уведомления" title="Уведомления" onClick={enablePush}><Bell size={18} /></button>
          <div className="rail-spacer" />
          <button className="rail-button" aria-label="Установка приложения" title="Установить приложение" onClick={installApp}><Smartphone size={18} /></button>
          <button className="rail-button" aria-label="Настройки" title="Настройки" onClick={() => notify("Настройки аккаунта и приватности появятся в следующем обновлении.", "info")}><Settings2 size={18} /></button>
          <button className="rail-avatar" onClick={supabaseConfigured ? signOut : () => notify("В демо-режиме аккаунт не подключён.", "info")} aria-label="Аккаунт">{session?.user.email?.slice(0, 1).toUpperCase() || "C"}</button>
        </aside>

        <aside className={"sidebar" + (mobileMenuOpen ? " sidebar-mobile-open" : "")}>
          <div className="sidebar-brand-row">
            <a className="brand" href="./"><span className="brand-mark"><CalendarDays size={17} /></span><span>calender<span className="brand-period">.</span></span></a>
            <button className="subtle-icon-button mobile-sidebar-close" onClick={() => setMobileMenuOpen(false)} aria-label="Закрыть меню"><X size={17} /></button>
            <button className="subtle-icon-button" onClick={() => { setSearchOpen(!searchOpen); setSearchValue(""); }} aria-label="Поиск"><Search size={17} /></button>
          </div>
          {searchOpen && <div className="search-box"><Search size={15} /><input autoFocus value={searchValue} onChange={(e) => setSearchValue(e.target.value)} placeholder="Найти событие…" /><button onClick={() => { setSearchValue(""); setSearchOpen(false); }} aria-label="Закрыть поиск"><X size={14} /></button></div>}
          <div className="sidebar-date-row"><span>Мини-календарь</span><div><button onClick={() => setFocusDate((date) => subMonths(date, 1))} aria-label="Предыдущий месяц"><ChevronLeft size={14} /></button><button onClick={() => setFocusDate((date) => addMonths(date, 1))} aria-label="Следующий месяц"><ChevronRight size={14} /></button></div></div>
          <div className="mini-month-label">{humanMonth(focusDate)}</div>
          <div className="mini-calendar">
            {["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map((name) => <span className="mini-weekday" key={name}>{name}</span>)}
            {monthDays.map((day) => <button key={day.toISOString()} className={"mini-day" + (!isSameMonth(day, focusDate) ? " out-month" : "") + (isSameDay(day, focusDate) ? " selected" : "") + (isToday(day) ? " is-today" : "")} onClick={() => { setFocusDate(day); setView("day"); setMobileMenuOpen(false); }}>{format(day, "d")}{events.some((event) => isSameDay(new Date(event.startAt), day)) && <i />}</button>)}
          </div>
          <div className="sidebar-section-heading"><span>Разделы</span></div>
          <button className={"sidebar-nav-item" + (activePage === "calendar" ? " active" : "")} onClick={() => { setActivePage("calendar"); setView("week"); }}><CalendarRange size={17} /><span>Календарь</span><span className="nav-count">{events.length}</span></button>
          <button className={"sidebar-nav-item" + (activePage === "tasks" ? " active" : "")} onClick={() => setActivePage("tasks")}><ListTodo size={17} /><span>Мои задачи</span><span className="nav-count">{tasks.filter((task) => !task.completed).length}</span></button>
          <button className={"sidebar-nav-item" + (activePage === "people" ? " active" : "")} onClick={() => setActivePage("people")}><Users size={17} /><span>Люди</span><span className="nav-count">{people.length}</span></button>
          <button className={"sidebar-nav-item" + (activePage === "profile" ? " active" : "")} onClick={() => setActivePage("profile")}><UserCircle size={17} /><span>Мой профиль</span></button>
          <div className="sidebar-section-heading section-with-action"><span>Предстоящие</span><button onClick={() => openNewEvent(new Date())} aria-label="Добавить событие"><Plus size={16} /></button></div>
          <div className="sidebar-upcoming">
            {nextEvents.slice(0, 3).map((event) => <button className="sidebar-event" key={event.id} onClick={() => openEditEvent(event)}><span className={"event-dot dot-" + event.color} /><span className="sidebar-event-copy"><strong>{event.title}</strong><small>{format(new Date(event.startAt), "EEE, d MMM · HH:mm", { locale: ru })}</small></span></button>)}
            {!nextEvents.length && <div className="sidebar-muted">Пока всё свободно</div>}
          </div>
          <div className="sidebar-promo">
            <div className="promo-icon"><Sparkles size={17} /></div>
            <strong>Оставьте место для жизни</strong>
            <p>Не заполняйте каждый час. Паузы тоже часть плана.</p>
            <button onClick={() => openNewEvent(focusDate)}>Добавить план <ArrowLeft className="promo-arrow" size={14} /></button>
            <div className="promo-decoration"><span /><span /><span /><span /><span /><span /><span /><span /><span /></div>
          </div>
          <div className="sidebar-account">
            <div className="account-avatar">{session?.user.email?.slice(0, 1).toUpperCase() || "C"}</div>
            <div className="account-copy"><strong>{session?.user.email?.split("@")[0] || "Гостевой режим"}</strong><small>{session ? "Облачная синхронизация" : "Локальное пространство"}</small></div>
            <button className="subtle-icon-button" onClick={session ? signOut : () => notify("Настройте Supabase, чтобы создать аккаунт.", "info")} title={session ? "Выйти" : "Аккаунт"}>{session ? <LogOut size={16} /> : <ChevronDown size={16} />}</button>
          </div>
        </aside>

        <main className="main-panel">
          <header className="main-topbar">
            <div className="mobile-menu-title"><button className="subtle-icon-button mobile-menu-trigger" onClick={() => setMobileMenuOpen(true)} aria-label="Меню"><Menu size={20} /></button><span className="mobile-main-title">Календарь</span></div>
            <div className="topbar-date"><h1>{activePage === "calendar" ? humanMonth(focusDate) : activePage === "tasks" ? "Мои задачи" : activePage === "profile" ? "Мой профиль" : "Люди"}</h1><span className="today-caption">{activePage === "calendar" ? format(focusDate, "EEEE, d MMMM", { locale: ru }) : activePage === "tasks" ? "Все дела в одном месте" : activePage === "profile" ? "Ваши данные и настройки аккаунта" : "Контакты и история встреч"}</span></div>
            <div className="topbar-actions">
              {activePage === "calendar" && <div className="date-nav"><button onClick={() => navigateDate(-1)} aria-label="Назад"><ChevronLeft size={17} /></button><button className="today-button" onClick={() => setFocusDate(startOfDay(new Date()))}>Сегодня</button><button onClick={() => navigateDate(1)} aria-label="Вперёд"><ChevronRight size={17} /></button></div>}
              {activePage === "calendar" && <div className="view-switcher">{viewLabels.map((item) => <button key={item.value} onClick={() => setView(item.value)} className={view === item.value ? "selected" : ""}>{item.label}</button>)}</div>}
              {activePage === "calendar" && <button className="topbar-icon-button" onClick={enablePush} aria-label="Уведомления" title="Уведомления">{pushEnabled ? <CheckCheck size={17} /> : <Bell size={17} />}</button>}
              {activePage === "calendar" && <button className="topbar-icon-button panel-toggle-button" onClick={() => setShowInsightsPanel((current) => !current)} aria-label={showInsightsPanel ? "Скрыть правую панель" : "Показать правую панель"} title={showInsightsPanel ? "Скрыть правую панель" : "Показать правую панель"}>{showInsightsPanel ? <PanelRightClose size={17} /> : <PanelRightOpen size={17} />}</button>}
              {activePage === "calendar" && <button className="primary-button create-button" onClick={() => openNewEvent()}><Plus size={17} /><span>Событие</span></button>}
              {activePage === "tasks" && <button className="primary-button create-button" onClick={() => document.getElementById("tasks-page-input")?.focus()}><Plus size={17} /><span>Задача</span></button>}
              {activePage === "people" && <button className="primary-button create-button" onClick={() => document.getElementById("person-name-input")?.focus()}><Plus size={17} /><span>Контакт</span></button>}
              {activePage === "profile" && <button className="primary-button create-button" onClick={() => void signOut()}><LogOut size={16} /><span>Выйти</span></button>}
            </div>
          </header>

          <div className="agenda-toolbar">
            <div className="agenda-toolbar-label"><span className="toolbar-dot" />{view === "day" ? "План на день" : view === "week" ? "Ваш ритм на неделю" : view === "month" ? "Все дни месяца" : "Год в планах"}<span className="toolbar-small">{loadingData ? "Синхронизация…" : ""}</span></div>
            <div className="toolbar-right">
              {loadingData && <span className="tiny-spinner" />}
              <button className="quiet-button" onClick={installApp}><Download size={15} /><span>На экран</span></button>
              <button className="quiet-button" onClick={() => notify(session ? "Ваши записи синхронизируются через Supabase." : "Это локальное демо. Подключите облако через README для синхронизации.", "info")}><Cloud size={15} /><span>{session ? "В облаке" : "Локально"}</span></button>
            </div>
          </div>

          {activePage === "calendar" && <section className="agenda-scroll" aria-label="Календарь">
            {view === "month" && (
              <div className="month-view">
                <div className="month-weekdays">{["Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье"].map((day, index) => <span key={day} className={index > 4 ? "weekend" : ""}>{day}</span>)}</div>
                <div className="month-grid">
                  {monthGridDays.map((day) => {
                    const dayEvents = selectedDayEvents(day);
                    return <div key={day.toISOString()} className={"month-cell" + (!isSameMonth(day, focusDate) ? " outside" : "") + (isToday(day) ? " today-cell" : "") + (isSameDay(day, focusDate) ? " focus-cell" : "")} onDoubleClick={() => openNewEvent(day)}>
                      <button className={"month-cell-date" + (isToday(day) ? " today-number" : "")} onClick={() => setFocusDate(day)}>{format(day, "d")}</button>
                      <div className="month-cell-events">
                        {dayEvents.slice(0, 3).map((event) => <button key={event.id} className={"month-event event-" + event.color} onClick={() => openEditEvent(event)} title={event.title}><span>{event.allDay ? "Весь день" : format(new Date(event.startAt), "HH:mm")}</span> {event.title}</button>)}
                        {dayEvents.length > 3 && <button className="more-events" onClick={() => { setFocusDate(day); setView("day"); }}>+ ещё {dayEvents.length - 3}</button>}
                        {!dayEvents.length && isSameDay(day, focusDate) && <button className="add-in-cell" onClick={() => openNewEvent(day)}><Plus size={14} /> Добавить</button>}
                      </div>
                    </div>;
                  })}
                </div>
              </div>
            )}

            {(view === "week" || view === "day") && (
              <div className="agenda-list">
                {(view === "day" ? [focusDate] : weekDays).map((day, index) => {
                  const dayEvents = selectedDayEvents(day);
                  return <section className={"day-section" + (isToday(day) ? " current-day-section" : "")} key={day.toISOString()}>
                    <button className="day-stamp" onClick={() => { setFocusDate(day); if (view === "week") setView("day"); }} aria-label={"Открыть " + format(day, "d MMMM", { locale: ru })}>
                      <span className="day-stamp-number">{format(day, "dd")}</span>
                      <span className="day-stamp-meta"><strong>{format(day, "EEE", { locale: ru })}</strong><small>{format(day, "MMM", { locale: ru })}</small></span>
                      {isToday(day) && <span className="today-indicator">СЕГОДНЯ</span>}
                    </button>
                    <div className="day-timeline">
                      {dayEvents.map((event) => <button className={"agenda-event event-" + event.color} key={event.id} onClick={() => openEditEvent(event)}>
                        <span className={"agenda-event-line line-" + event.color} />
                        <span className="agenda-event-time"><strong>{event.allDay ? "Весь день" : format(new Date(event.startAt), "HH:mm")}</strong>{!event.allDay && <small>{format(new Date(event.endAt), "HH:mm")}</small>}</span>
                        <span className="agenda-event-copy"><span className="event-category">{event.color === "red" ? "Важное" : event.color === "green" ? "Работа" : event.color === "yellow" ? "Личное" : event.color === "blue" ? "План" : "Идеи"}</span><strong>{event.title}</strong>{(event.description || event.location) && <small>{[event.description, event.location].filter(Boolean).join(" · ")}</small>}</span>
                        {event.reminderAt && <span className="reminder-indicator" title="Есть напоминание"><Bell size={13} /></span>}
                        <span className="event-menu"><Ellipsis size={17} /></span>
                      </button>)}
                      {!dayEvents.length && <button className="empty-time-slot" onClick={() => openNewEvent(day)}><span className="empty-time-mark" /> <span>Немного свободного времени</span><Plus size={15} /></button>}
                      <button className="add-day-event" onClick={() => openNewEvent(day)}><Plus size={15} /> Добавить событие</button>
                    </div>
                    {index < (view === "day" ? 0 : weekDays.length - 1) && <div className="day-divider" />}
                  </section>;
                })}
              </div>
            )}

            {view === "year" && (
              <div className="year-grid">
                {yearMonths.map((month) => {
                  const days = eachDayOfInterval({ start: startOfWeek(startOfMonth(month), { weekStartsOn: 1 }), end: endOfWeek(endOfMonth(month), { weekStartsOn: 1 }) });
                  return <button className={"year-month-card" + (isSameMonth(month, focusDate) ? " year-month-selected" : "")} key={month.toISOString()} onClick={() => { setFocusDate(month); setView("month"); }}>
                    <strong>{format(month, "LLLL", { locale: ru })}</strong>
                    <div className="year-mini-grid">{days.map((day) => <span key={day.toISOString()} className={(!isSameMonth(day, month) ? "tiny-outside " : "") + (isToday(day) ? "tiny-today " : "") + (events.some((event) => isSameDay(new Date(event.startAt), day)) ? "tiny-has-event" : "")}>{format(day, "d")}</span>)}</div>
                    <small>{events.filter((event) => isSameMonth(new Date(event.startAt), month)).length} событий</small>
                  </button>;
                })}
              </div>
            )}

            <div className="agenda-footer"><span><span className="footer-indicator" /> Всё на своих местах</span><span>Ваш календарь, ваш темп.</span></div>
          </section>}

          {activePage === "tasks" && <section className="page-scroll tasks-page">
            <div className="page-intro"><span className="eyebrow-small">СПИСОК ДЕЛ</span><h2>Всё постепенно становится на свои места.</h2><p>Добавляйте задачи, отмечайте выполненное и возвращайтесь к важному в своём темпе.</p></div>
            <div className="tasks-summary-row">
              <div className="summary-stat"><span>Всего задач</span><strong>{tasks.length}</strong></div>
              <div className="summary-stat"><span>Выполнено</span><strong>{completedCount}</strong></div>
              <div className="summary-stat"><span>Осталось</span><strong>{tasks.length - completedCount}</strong></div>
            </div>
            <form className="task-page-add" onSubmit={addTask}><Plus size={18} /><input id="tasks-page-input" value={taskInput} onChange={(e) => setTaskInput(e.target.value)} placeholder="Что нужно сделать?" maxLength={160} /><button className="primary-button" type="submit" disabled={!taskInput.trim()}>Добавить задачу <ChevronRight size={15} /></button></form>
            <div className="page-section-heading"><div><h3>Текущие задачи</h3><p>{tasks.length - completedCount} ещё ждут внимания</p></div><span className="page-count">{tasks.length}</span></div>
            <div className="full-task-list">
              {tasks.filter((task) => !task.completed).map((task) => <div className="full-task-row" key={task.id}>
                <button className={"task-check task-check-" + task.color + (task.completed ? " checked" : "")} onClick={() => void toggleTask(task)} aria-label="Отметить выполненной">{task.completed && <Check size={12} />}</button>
                <div className="full-task-copy"><strong>{task.title}</strong><small>{task.dueAt ? "Срок: " + format(new Date(task.dueAt), "d MMM yyyy, HH:mm", { locale: ru }) : "Без установленного срока"}</small></div>
                <button className="task-delete visible-task-delete" onClick={() => void deleteTask(task)} aria-label="Удалить задачу"><Trash2 size={15} /></button>
              </div>)}
              {tasks.every((task) => task.completed) && <div className="page-empty-state"><span className="empty-state-icon"><CheckCheck size={23} /></span><strong>Все текущие задачи выполнены</strong><p>Отличная работа. Можно добавить новое дело или отдохнуть.</p></div>}
            </div>
            {completedCount > 0 && <><div className="page-section-heading completed-heading"><div><h3>Выполнено</h3><p>Сделанное тоже заслуживает внимания</p></div><span className="page-count">{completedCount}</span></div><div className="full-task-list">{tasks.filter((task) => task.completed).map((task) => <div className="full-task-row done-task" key={task.id}><button className={"task-check task-check-" + task.color + " checked"} onClick={() => void toggleTask(task)} aria-label="Вернуть в текущие задачи"><Check size={12} /></button><div className="full-task-copy"><strong>{task.title}</strong><small>Выполнено</small></div><button className="task-delete visible-task-delete" onClick={() => void deleteTask(task)} aria-label="Удалить задачу"><Trash2 size={15} /></button></div>)}</div></>}
          </section>}

          {activePage === "profile" && <section className="page-scroll profile-page">
            <div className="page-intro"><span className="eyebrow-small">ЛИЧНОЕ ПРОСТРАНСТВО</span><h2>Ваш профиль, ваши правила.</h2><p>Настройте данные, которые помогают вам и вашим планам оставаться в порядке. Почта используется для входа и пока не редактируется здесь.</p></div>
            <div className="profile-layout">
              <div className="profile-identity-card">
                <div className="profile-avatar-large">{profile.avatarUrl ? <img src={profile.avatarUrl} alt="Аватар профиля" referrerPolicy="no-referrer" /> : <span>{(profile.displayName || session?.user.email || "C").slice(0,1).toUpperCase()}</span>}</div>
                <h3>{profile.displayName || "Ваше имя"}</h3><p>{session?.user.email || "Демо-профиль"}</p>
                <span className="profile-provider"><ShieldCheck size={14} /> {session?.user.app_metadata?.provider === "google" ? "Вход через Google" : session ? "Аккаунт по электронной почте" : "Локальный профиль"}</span>
                <div className="profile-identity-divider" />
                <div className="profile-security-note"><LockKeyhole size={16} /><span>Личная информация видна только в вашем аккаунте.</span></div>
              </div>
              <form className="profile-edit-card" onSubmit={saveProfile}>
                <div className="panel-section-title"><div><h3>Личные данные</h3><p>Вы можете изменить их в любое время.</p></div><Pencil size={16} /></div>
                <label className="field-label">Имя и фамилия<input className="plain-input" value={profile.displayName} onChange={(e) => setProfile((current) => ({ ...current, displayName: e.target.value }))} maxLength={100} placeholder="Как к вам обращаться" /></label>
                <label className="field-label">Электронная почта<span className="profile-email-field"><AtSign size={16} /><input value={session?.user.email || "Демо-режим"} readOnly aria-readonly="true" /></span></label>
                <div className="form-two-cols"><label className="field-label">Телефон<span className="input-with-icon"><Phone size={16} /><input className="plain-input" value={profile.phone} onChange={(e) => setProfile((current) => ({ ...current, phone: e.target.value }))} maxLength={40} placeholder="+..." /></span></label><label className="field-label">Дата рождения<span className="input-with-icon"><Cake size={16} /><input className="plain-input" type="date" value={profile.birthday} onChange={(e) => setProfile((current) => ({ ...current, birthday: e.target.value }))} /></span></label></div>
                <label className="field-label">О себе<textarea className="plain-input note-input" value={profile.bio} onChange={(e) => setProfile((current) => ({ ...current, bio: e.target.value }))} maxLength={1000} rows={4} placeholder="Пара слов о себе, ваших интересах или предпочтениях…" /></label>
                <div className="profile-form-footer"><span>Последние изменения сохраняются в облаке.</span><button className="primary-button" type="submit" disabled={profileBusy}>{profileBusy ? <span className="spinner" /> : <Save size={15} />} Сохранить профиль</button></div>
              </form>
            </div>
            <div className="account-details-card"><div className="account-detail-icon"><History size={18} /></div><div><strong>История и данные профиля</strong><p>Контакты и история встреч хранятся в отдельном разделе «Люди». История входов не раскрывается через профиль приложения; системные события аутентификации остаются в журнале Supabase.</p></div><button className="secondary-button" type="button" onClick={() => setActivePage("people")}>Открыть «Люди» <ChevronRight size={15} /></button></div>
          </section>}

          {activePage === "people" && <section className="page-scroll people-page">
            <div className="page-intro"><span className="eyebrow-small">ВАЖНЫЕ СВЯЗИ</span><h2>Люди, встречи и воспоминания.</h2><p>Собирайте контактные данные, заметки о людях и историю встреч в личном пространстве. Эти записи не публикуются и не доступны другим аккаунтам.</p></div>
            <div className="people-layout">
              <div className="people-main-column">
                <div className="page-section-heading"><div><h3>Мои люди</h3><p>Контакты и короткие заметки</p></div><span className="page-count">{people.length}</span></div>
                <div className="people-grid">
                  {people.map((person) => <article className="person-card" key={person.id}>
                    <div className="person-card-top"><span className="person-avatar">{person.name.slice(0,1).toUpperCase()}</span><div className="person-main-info"><strong>{person.name}</strong><small>{person.relationship || "Контакт"}</small></div><button className="subtle-icon-button" aria-label="Редактировать контакт" onClick={() => { setEditingPerson(person); setPersonDraft({ name: person.name, relationship: person.relationship, email: person.email, phone: person.phone, notes: person.notes }); document.getElementById("person-name-input")?.focus(); }}><Pencil size={14} /></button></div>
                    {person.notes && <p className="person-notes">{person.notes}</p>}
                    {person.email && <div className="person-contact-line"><AtSign size={14} /><span>{person.email}</span></div>}
                    {person.phone && <div className="person-contact-line"><Phone size={14} /><span>{person.phone}</span></div>}
                    <div className="person-card-footer"><span>{visitHistory.filter((visit) => visit.personId === person.id).length} записей в истории</span><button className="text-action" onClick={() => { setVisitDraft((current) => ({ ...current, personId: person.id })); document.getElementById("visit-title-input")?.focus(); }}>Добавить встречу <Plus size={13} /></button><button className="person-delete" onClick={() => void deletePerson(person)} aria-label="Удалить контакт"><Trash2 size={14} /></button></div>
                  </article>)}
                  {!people.length && <div className="page-empty-state people-empty"><span className="empty-state-icon"><Users size={23} /></span><strong>Ваш список людей начнётся здесь</strong><p>Добавьте близких, коллег или людей, с которыми хотите сохранять историю встреч.</p></div>}
                </div>
              </div>
              <div className="people-form-column">
                <form className="people-form-card" onSubmit={savePerson}>
                  <div className="panel-section-title"><div><h3>{editingPerson ? "Изменить контакт" : "Добавить человека"}</h3><p>Контактная информация</p></div><UserCircle size={17} /></div>
                  <label className="field-label">Имя<input id="person-name-input" className="plain-input" value={personDraft.name} onChange={(e) => setPersonDraft((current) => ({ ...current, name: e.target.value }))} maxLength={100} required placeholder="Имя и фамилия" /></label>
                  <label className="field-label">Кто этот человек?<input className="plain-input" value={personDraft.relationship} onChange={(e) => setPersonDraft((current) => ({ ...current, relationship: e.target.value }))} maxLength={100} placeholder="Друг, коллега, клиент…" /></label>
                  <label className="field-label">Электронная почта<input className="plain-input" type="email" value={personDraft.email} onChange={(e) => setPersonDraft((current) => ({ ...current, email: e.target.value }))} maxLength={254} placeholder="name@example.com" /></label>
                  <label className="field-label">Телефон<input className="plain-input" type="tel" value={personDraft.phone} onChange={(e) => setPersonDraft((current) => ({ ...current, phone: e.target.value }))} maxLength={40} placeholder="+..." /></label>
                  <label className="field-label">Заметки<textarea className="plain-input note-input" value={personDraft.notes} onChange={(e) => setPersonDraft((current) => ({ ...current, notes: e.target.value }))} maxLength={1500} rows={3} placeholder="Что важно помнить о человеке…" /></label>
                  <div className="profile-form-footer"><span>Только для вашего аккаунта</span><button className="primary-button" type="submit"><Save size={15} />{editingPerson ? "Сохранить" : "Добавить"}</button></div>
                  {editingPerson && <button className="cancel-edit-link" type="button" onClick={() => { setEditingPerson(null); setPersonDraft({ name: "", relationship: "", email: "", phone: "", notes: "" }); }}>Отменить редактирование</button>}
                </form>
              </div>
            </div>
            <div className="visit-history-card">
              <div className="page-section-heading"><div><h3>История встреч и посещений</h3><p>Сохраняйте, где были и с кем встречались.</p></div><span className="page-count">{visitHistory.length}</span></div>
              <form className="visit-entry-form" onSubmit={saveVisit}>
                <label className="field-label">Событие / место<input id="visit-title-input" className="plain-input" value={visitDraft.title} onChange={(e) => setVisitDraft((current) => ({ ...current, title: e.target.value }))} maxLength={160} required placeholder="Например, встреча в любимом кафе" /></label>
                <label className="field-label">С кем<select className="plain-input" value={visitDraft.personId} onChange={(e) => setVisitDraft((current) => ({ ...current, personId: e.target.value }))}><option value="">Без привязки к контакту</option>{people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
                <label className="field-label">Дата и время<input className="plain-input" type="datetime-local" value={visitDraft.visitedAt} onChange={(e) => setVisitDraft((current) => ({ ...current, visitedAt: e.target.value }))} required /></label>
                <label className="field-label">Заметка<textarea className="plain-input" value={visitDraft.notes} onChange={(e) => setVisitDraft((current) => ({ ...current, notes: e.target.value }))} maxLength={1500} rows={2} placeholder="Детали, которые хочется сохранить…" /></label>
                <button className="primary-button" type="submit"><Plus size={15} /> Добавить запись</button>
              </form>
              <div className="visit-history-list">
                {visitHistory.map((visit) => <div className="visit-history-row" key={visit.id}><span className="visit-history-date"><strong>{format(new Date(visit.visitedAt), "d", { locale: ru })}</strong><small>{format(new Date(visit.visitedAt), "MMM yyyy", { locale: ru })}</small></span><div className="visit-history-copy"><strong>{visit.title}</strong><small>{visit.personName || "Без контакта"} · {format(new Date(visit.visitedAt), "HH:mm")}</small>{visit.notes && <p>{visit.notes}</p>}</div><button className="person-delete" onClick={() => void deleteVisit(visit)} aria-label="Удалить запись истории"><Trash2 size={14} /></button></div>)}
                {!visitHistory.length && <div className="visit-history-empty"><History size={20} /><span>Пока нет записей. Добавьте первую встречу или посещение выше.</span></div>}
              </div>
            </div>
          </section>}
        </main>

        {showInsightsPanel && activePage === "calendar" && <aside className="insights-panel">
          <div className="insights-head"><div><span className="eyebrow-small">ВАШЕ ПРОСТРАНСТВО</span><h2>Панель дня<span className="brand-period">.</span></h2></div></div>
          <div className="dotted-art" aria-hidden="true"><div className="art-sun" /><div className="art-arch" /><span className="art-label">MAKE<br />SPACE</span></div>
          <section className="focus-card">
            <div className="focus-card-top"><span className="focus-icon"><Focus size={17} /></span><span className="card-overline">МАЛЕНЬКИЙ ФОКУС</span><span className="focus-spark">✳</span></div>
            <h3>Не обязательно<br />успеть всё.</h3><p>Выберите главное на сегодня. Остальному можно дать время.</p>
            <div className="focus-progress"><span style={{ width: Math.min(100, tasks.length ? completedCount / tasks.length * 100 : 0) + "%" }} /></div><div className="focus-progress-label"><span>{completedCount} из {tasks.length} задач</span><strong>{tasks.length ? Math.round(completedCount / tasks.length * 100) : 0}%</strong></div>
          </section>
          <section className="tasks-card" id="tasks-panel">
            <div className="panel-section-title"><div><h3>Задачи</h3><p>Понемногу — тоже прогресс</p></div><button className="round-add-button" onClick={() => document.getElementById("quick-task-input")?.focus()} aria-label="Добавить задачу"><Plus size={17} /></button></div>
            <form className="quick-task-form" onSubmit={addTask}><Plus size={15} /><input id="quick-task-input" value={taskInput} onChange={(e) => setTaskInput(e.target.value)} placeholder="Добавить задачу…" maxLength={160} /><button type="submit" disabled={!taskInput.trim()} aria-label="Сохранить задачу"><ChevronRight size={16} /></button></form>
            <div className="task-list">
              {tasks.map((task) => <div className={"task-row" + (task.completed ? " task-completed" : "")} key={task.id}>
                <button className={"task-check task-check-" + task.color + (task.completed ? " checked" : "")} onClick={() => void toggleTask(task)} aria-label={task.completed ? "Отметить невыполненной" : "Отметить выполненной"}>{task.completed && <Check size={12} />}</button>
                <button className="task-title" onClick={() => void toggleTask(task)}>{task.title}</button>
                <button className="task-delete" onClick={() => void deleteTask(task)} aria-label="Удалить задачу"><X size={13} /></button>
              </div>)}
              {!tasks.length && <div className="empty-tasks">Чистый лист. Добавьте первое дело выше.</div>}
            </div>
            {tasks.length > 4 && <span className="task-overflow">И ещё {tasks.length - 4} задач в списке</span>}
          </section>
          <section className="up-next-card">
            <div className="panel-section-title"><div><h3>На горизонте</h3><p>Ближайшие встречи</p></div><Clock3 size={17} /></div>
            {nextEvents.slice(0, 5).map((event) => <button key={event.id} className="horizon-event" onClick={() => openEditEvent(event)}><span className={"horizon-color color-" + event.color} /><span><strong>{event.title}</strong><small>{humanShortDate(new Date(event.startAt))} · {event.allDay ? "Весь день" : format(new Date(event.startAt), "HH:mm")}{event.location ? " · " + event.location : ""}</small></span><ChevronRight size={15} /></button>)}
            {!nextEvents.length && <p className="empty-horizon">Пока ничего не запланировано.</p>}
          </section>
          <div className="notification-card">
            <span className="notification-card-icon"><Bell size={17} /></span><div><strong>{pushEnabled ? "Уведомления включены" : "Не пропускайте важное"}</strong><p>{pushEnabled ? "Это устройство подключено к напоминаниям." : "Напоминания помогут вовремя переключиться."}</p><button onClick={enablePush}>{pushEnabled ? "Проверить настройки" : "Включить уведомления"} <ChevronRight size={14} /></button></div>
          </div>
          <div className="security-note"><ShieldCheck size={14} /><span>{session ? "Облачная синхронизация включена" : "Демо: данные остаются на устройстве"}</span></div>
        </aside>}
      </div>

      <nav className="mobile-bottom-nav" aria-label="Основная навигация">
        <button className={activePage === "calendar" ? "mobile-nav-active" : ""} onClick={() => { setActivePage("calendar"); setView("week"); setFocusDate(startOfDay(new Date())); }}><CalendarRange size={19} /><span>Календарь</span></button>
        <button className={activePage === "calendar" && view === "month" ? "mobile-nav-active" : ""} onClick={() => { setActivePage("calendar"); setView("month"); }}><LayoutGrid size={19} /><span>Месяц</span></button>
        <button className={activePage === "tasks" ? "mobile-nav-active" : ""} onClick={() => setActivePage("tasks")}><ListTodo size={19} /><span>Задачи</span></button>
        <button className={activePage === "profile" || activePage === "people" ? "mobile-nav-active" : ""} onClick={() => setMobileMenuOpen(true)}><Menu size={19} /><span>Ещё</span></button>
      </nav>

      {modalOpen && <EventModal event={editingEvent} date={focusDate} onClose={() => setModalOpen(false)} onSave={saveEvent} onDelete={deleteEvent} />}
    </div>
  );
}

export default App;
