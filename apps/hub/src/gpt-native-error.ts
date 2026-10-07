import { z } from "zod";

export const nativeFailureSchema = z.object({
  code: z.string().regex(/^NATIVE_[A-Z_]+$/),
  httpStatus: z.number().int().min(400).max(599).optional(),
  retryAt: z.number().int().positive().safe().optional(),
  publicMessage: z.string().max(2000).optional(),
  providerCode: z
    .string()
    .regex(/^[a-zA-Z0-9_.-]{1,100}$/)
    .optional(),
});
export type NativeFailure = z.infer<typeof nativeFailureSchema>;
export function nativeFailure(error: unknown): NativeFailure {
  const source = error as Partial<NativeFailure> & { message?: string };
  const parsed = nativeFailureSchema.safeParse({
    ...source,
    code: source?.code ?? source?.message,
  });
  return parsed.success ? parsed.data : { code: "NATIVE_READ_UNAVAILABLE" };
}
export function nativeError(value: unknown): Error & NativeFailure {
  const failure = nativeFailure(value);
  return Object.assign(new Error(failure.code), failure);
}
export function nativeFailureText(value: NativeFailure): string {
  if (value.publicMessage) return value.publicMessage;
  if (value.httpStatus)
    return `GPT вернул ошибку HTTP ${value.httpStatus}${value.providerCode ? ` (${value.providerCode})` : ""}.`;
  const messages: Record<string, string> = {
    NATIVE_RATE_LIMITED: "GPT временно ограничил частоту запросов.",
    NATIVE_ACCOUNT_CHANGED: "В клиенте GPT изменился аккаунт.",
    NATIVE_ACCOUNT_MISMATCH: "Аккаунт клиента GPT не совпадает с подключённым.",
    NATIVE_ACCOUNT_UNAVAILABLE: "Клиент GPT не предоставил данные аккаунта.",
    NATIVE_INVALID_SETTINGS: "Выбранная модель или режим недоступны в клиенте GPT.",
    NATIVE_CONVERSATION_BUSY: "В этом чате GPT ещё выполняется запрос.",
    NATIVE_DRAFT_PRESENT: "В клиенте GPT в этом чате уже есть черновик.",
    NATIVE_DISCONNECTED: "Соединение с клиентом GPT прервалось.",
    NATIVE_UNAVAILABLE: "Клиент GPT недоступен.",
    NATIVE_READ_UNAVAILABLE: "Клиент GPT не смог вернуть данные.",
    NATIVE_BUSY: "Клиент GPT занят. Запрос ожидает обработки.",
    NATIVE_MANUAL_RECOVERY: "Открыто ручное управление клиентом GPT.",
  };
  return messages[value.code] ?? `Ошибка клиента GPT: ${value.code}.`;
}
