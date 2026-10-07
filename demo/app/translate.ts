import labels from "./english.json";
import more from "./more-english.json";
const dictionary: Record<string, string> = labels;
Object.assign(dictionary, more);
Object.assign(dictionary, {
  "Свёрнутые окна": "Minimized windows",
  "Развернуть док": "Expand dock",
  "Убрать док к перегородке": "Collapse dock to the divider",
  "Убрать док": "Collapse dock",
  "Нет соединения": "Disconnected",
  "Подключаем рабочий стол…": "Connecting to the desktop…",
  Справка: "Help",
  "Закрыть справку": "Close help",
  "Оглавление справки": "Help contents",
  Оглавление: "Contents",
  Клавиши: "Keyboard shortcuts",
  "Поиск по справке": "Search help",
  "Найти в справке": "Find in help",
  "Категории справки": "Help categories",
  "Ширина каталога справки": "Help index width",
  "Найдено статей:": "Articles found:",
  "Сбросить поиск": "Clear search",
  "В этой статье": "In this article",
  "Связанные статьи": "Related articles",
  "Смотри также": "See also",
  "Руководство пользователя": "User guide",
  "Первое знакомство": "Getting started",
  "Как устроено рабочее место": "Explore the workspace",
  "Выбери категорию и подкатегорию в оглавлении или введи вопрос в поиск. Поиск учитывает названия и полный текст статей.":
    "Choose a category or search for a feature. Search covers article titles and descriptions.",
  "Начни с устройства рабочего места. Если уже знаешь разделы, выбери рабочий пример: у каждого есть исходная ситуация, последовательность действий и ожидаемый результат.":
    "Start with the workspace. Explore the feature catalogue to learn what each part does and which examples you can try here.",
  "Ничего не найдено. Попробуй название действия: «слияние», «приглашение», «черновик».":
    "No matches. Try an action such as files, invitation or draft.",
  Отмена: "Cancel",
  Готово: "Done",
  "Без проекта": "Unassigned",
  "Выбрано:": "Selected:",
  "Выбрать загруженные": "Select loaded items",
  "Снять выбор": "Clear selection",
  "Подготовить пакет": "Prepare download",
  "Действия с выбранными результатами": "Selected result actions",
  "Действия: Другие категории": "Actions: More categories",
  "Ход работы": "Work",
  "Выбрать файлы или изображения": "Choose files or images",
  "Загрузка чата Codex": "Loading Codex chat",
  "Создай диалог, чтобы начать": "Create a chat to begin",
  "Продолжить на сайте?": "Continue here?",
  "Продолжить и отправить": "Continue and send",
  "Выбери проект или создай новый.": "Choose a project or create one.",
  "Код и инструменты уже на твоём компьютере.":
    "Your code and tools stay on your computer.",
  "Codex на компьютере закроется, его текущие задачи остановятся. Сообщение с вложениями отправится в этот чат.":
    "The desktop Codex session will close. The message and attachments will be sent to this chat.",
});
const unknown = new Set<string>();
(window as any).__demo.untranslated = unknown;
function convert(text: string) {
  if (!/[\u0400-\u04ff]/.test(text)) return text;
  const key = text.trim();
  let next = dictionary[key] || dictionary[key.replace(/\s+/g, " ")];
  if (!next) {
    const prefixes: Record<string, string> = {
      "Действия: ": "Actions: ",
      "Восстановить: ": "Restore: ",
      "Завершить: ": "Complete: ",
      "Обзор проекта ": "Project overview: ",
      "Диалоги: ": "Chats: ",
      "Файлы: ": "Files: ",
      "Лимиты Codex: ": "Codex usage: ",
      "Активно: ": "Active: ",
      "Завершено, не просмотрено: ": "Completed, unread: ",
      "Открыть ": "Open ",
      "Копировать путь ": "Copy path ",
      "Обновлено ": "Updated ",
      "Включить ": "Stage ",
    };
    for (const [ru, en] of Object.entries(prefixes))
      if (key.startsWith(ru)) next = en + key.slice(ru.length);
    if (key.startsWith("Ширина ") && key.includes("Перетащи"))
      next = "Panel width. Drag or use arrow keys; double-click to reset.";
    if (next) next = next.replace(" в коммит", "");
    if (!next && /^[\d., ]+ (Б|КБ|МБ|ГБ|ТБ)$/.test(key))
      next = key.replace(
        /(Б|КБ|МБ|ГБ|ТБ)$/,
        (v) => ({ Б: "B", КБ: "KB", МБ: "MB", ГБ: "GB", ТБ: "TB" })[v]!,
      );
    if (!next && key.includes("осталось"))
      next = key
        .replaceAll("5 часов", "5 hours")
        .replaceAll("Неделя", "Week")
        .replaceAll("осталось", "remaining");
    if (!next && /^· \d+ потоков$/.test(key))
      next = key.replace("потоков", "threads");
    for (const [ru, en] of [
      ["Создана: ", "Created: "],
      ["Выполнено: ", "Completed: "],
      ["Действия раздела ", "Section actions: "],
      ["Действия пункта ", "Item actions: "],
    ])
      if (!next && key.startsWith(ru)) next = en + key.slice(ru.length);
    if (!next && key.includes(" · Изменено: "))
      next = key.replace(" · Изменено: ", " · Changed: ");
    if (!next && key.includes(" · Рабочая копия"))
      next = key.replace(" · Рабочая копия", " · Working copy");
    for (const [ru, en] of [
      ["Редактор ", "Editor: "],
      ["Посмотреть изменения ", "View changes: "],
    ])
      if (!next && key.startsWith(ru)) next = en + key.slice(ru.length);
  }
  if (!next) {
    unknown.add(key);
    return text;
  }
  return text.replace(key, next);
}
function translate(root: Node) {
  if (root.nodeType === 3) {
    const p = root.parentElement;
    if (p && !["SCRIPT", "STYLE", "TEXTAREA"].includes(p.tagName)) {
      const text = root.nodeValue || "",
        next = convert(text);
      if (text !== next) root.nodeValue = next;
    }
    return;
  }
  if (root instanceof Element) {
    for (const attr of ["title", "aria-label", "placeholder"]) {
      const text = root.getAttribute(attr);
      if (text) {
        const next = convert(text);
        if (next !== text) root.setAttribute(attr, next);
      }
    }
  }
  for (const child of root.childNodes) translate(child);
}
const observer = new MutationObserver((entries) => {
  observer.disconnect();
  for (const entry of entries) translate(entry.target);
  observer.observe(document.body, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ["title", "aria-label", "placeholder"],
  });
});
observer.observe(document.body, {
  subtree: true,
  childList: true,
  characterData: true,
  attributes: true,
  attributeFilter: ["title", "aria-label", "placeholder"],
});
document.documentElement.lang = "en";
