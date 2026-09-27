import { z } from "zod";

export const workspaceActions = [
  { id: "palette", label: "Поиск и команды", binding: "Primary+KeyK", inputs: true },
  {
    id: "switch-client",
    label: "Переключить Codex / GPT",
    binding: "Primary+Alt+KeyG",
    inputs: true,
  },
  { id: "home", label: "Обзор проекта", binding: null, inputs: false },
  { id: "work", label: "Работа · Codex", binding: null, inputs: false },
  { id: "discuss", label: "Обсудить проект в GPT", binding: null, inputs: false },
  { id: "new-chat", label: "Новый диалог", binding: null, inputs: false },
  { id: "results", label: "Результаты", binding: null, inputs: false },
  { id: "files", label: "Файлы проекта", binding: null, inputs: false },
  { id: "git", label: "GitHub проекта", binding: null, inputs: false },
  { id: "notes", label: "Заметки", binding: null, inputs: false },
  { id: "tasks", label: "Задачи", binding: null, inputs: false },
  { id: "content-search", label: "Поиск по содержимому", binding: null, inputs: true },
  { id: "remote", label: "Компьютер", binding: null, inputs: false },
  { id: "settings", label: "Настройки", binding: null, inputs: false },
  { id: "help", label: "Справка", binding: "F1", inputs: true },
] as const;
export type WorkspaceAction = (typeof workspaceActions)[number]["id"];
export type ShortcutOverrides = Partial<Record<WorkspaceAction, string | null>>;
export function normalizeShortcut(value: string): string {
  const parts = value.split("+");
  const code = parts.pop() ?? "";
  if (
    !/^(Key[A-Z]|Digit[0-9]|F[1-9]|F1[0-2]|Space|Comma|Period|Slash|Semicolon|Quote|BracketLeft|BracketRight|Backslash|Minus|Equal)$/.test(
      code,
    ) ||
    parts.some((p) => !["Primary", "Alt", "Shift"].includes(p)) ||
    new Set(parts).size !== parts.length
  )
    throw new Error("Нужна клавиша с Ctrl / ⌘. Используется физическое положение клавиши.");
  const normalized = [...["Primary", "Alt", "Shift"].filter((p) => parts.includes(p)), code].join(
    "+",
  );
  if (normalized === "F1") return normalized;
  if (!parts.includes("Primary") || /^F/.test(code))
    throw new Error("Используй сочетание с Ctrl / ⌘.");
  // Conservative cross-browser policy; editor/system keys are never reassigned.
  if (
    [
      "KeyA",
      "KeyC",
      "KeyV",
      "KeyX",
      "KeyZ",
      "KeyY",
      "KeyF",
      "KeyR",
      "KeyW",
      "KeyL",
      "KeyT",
      "KeyN",
      "KeyQ",
      "KeyP",
      "KeyS",
      "KeyO",
      "KeyH",
      "KeyJ",
      "KeyD",
      "KeyU",
      "KeyI",
      "Comma",
      "Equal",
      "Minus",
    ].includes(code) ||
    /^Digit/.test(code)
  )
    throw new Error("Это сочетание оставлено браузеру, системе или редактору.");
  return normalized;
}
export function effectiveShortcuts(overrides: ShortcutOverrides) {
  return Object.fromEntries(
    workspaceActions.map((a) => [
      a.id,
      Object.hasOwn(overrides, a.id) ? overrides[a.id] : a.binding,
    ]),
  ) as Record<WorkspaceAction, string | null>;
}
export const shortcutOverridesSchema = z
  .record(z.string(), z.string().max(70).nullable())
  .superRefine((value, ctx) => {
    for (const [id, binding] of Object.entries(value)) {
      if (!workspaceActions.some((a) => a.id === id))
        ctx.addIssue({ code: "custom", message: "Неизвестное действие", path: [id] });
      if (binding !== null)
        try {
          if (normalizeShortcut(binding) !== binding) throw new Error("Неканоническое сочетание");
        } catch (error) {
          ctx.addIssue({ code: "custom", message: String((error as Error).message), path: [id] });
        }
    }
    const seen = new Set<string>();
    for (const binding of Object.values(effectiveShortcuts(value as ShortcutOverrides))) {
      if (!binding) continue;
      if (seen.has(binding))
        ctx.addIssue({ code: "custom", message: "Это сочетание уже назначено другому действию." });
      seen.add(binding);
    }
  });
export const destinationSchema = z
  .object({
    client: z.enum(["codex", "gpt", "shared"]),
    kind: z.enum([
      "project",
      "thread",
      "discuss",
      "space",
      "activity",
      "brainstorm",
      "conversation",
    ]),
    id: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/),
  })
  .strict();
export type WorkspaceDestinationRef = z.infer<typeof destinationSchema>;
export const destinationKey = (ref: WorkspaceDestinationRef) =>
  `${ref.client}:${ref.kind}:${ref.id}`;
export interface WorkspaceDestinationItem {
  ref: WorkspaceDestinationRef;
  title: string;
  subtitle: string;
  projectId?: string;
}
export const navigationPreferencesSchema = z
  .object({
    recent: z.array(destinationSchema).max(32),
    pinned: z.array(destinationSchema).max(16),
  })
  .strict();
export type NavigationPreferences = z.infer<typeof navigationPreferencesSchema>;
