import { createHash, randomBytes } from "node:crypto";
import { HubError, type MachineConfig } from "@codex-web/shared";
import type { Store } from "./store.js";

export type RuntimeBinding = { capability: string; binding: string; cwd: string; create: boolean };
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function codexRuntimeBinding(
  store: Store,
  machine: MachineConfig,
  cwd: string,
  authority = "",
): RuntimeBinding | undefined {
  if (machine.type !== "ssh-windows" || !machine.codex.launcher || !machine.codex.persistent)
    return;
  const binding = hash([
    authority,
    machine.id,
    machine.ssh,
    machine.codex,
    machine.allowedProjectRoots,
    cwd,
  ]);
  let row = store.db
    .prepare("SELECT * FROM codex_runtime_bindings WHERE machineId=?")
    .get(machine.id);
  if (row && row.binding !== binding)
    throw new HubError(
      409,
      "RUNTIME_BINDING_CHANGED",
      "Настройки компьютера изменились. Сначала освободи прежнее подключение Codex.",
    );
  if (!row) {
    store.db
      .prepare("INSERT INTO codex_runtime_bindings(machineId,binding,capability) VALUES(?,?,?)")
      .run(machine.id, binding, randomBytes(32).toString("hex"));
    row = store.db
      .prepare("SELECT * FROM codex_runtime_bindings WHERE machineId=?")
      .get(machine.id)!;
  }
  return { binding, capability: String(row.capability), cwd, create: !row.instanceId };
}
export function confirmCodexRuntime(
  store: Store,
  machineId: string,
  binding: RuntimeBinding,
  raw: unknown,
  account: unknown,
) {
  const info = raw as { protocol?: number; runtimeId?: string; instanceId?: string } | undefined;
  if (
    info?.protocol !== 2 ||
    info.runtimeId !== binding.binding ||
    !/^[a-f0-9-]{36}$/.test(info.instanceId ?? "")
  )
    throw new HubError(
      503,
      "RUNTIME_PROTOCOL_REQUIRED",
      "Обнови Windows Companion для устойчивого подключения Codex.",
    );
  const row = store.db
    .prepare(
      "SELECT * FROM codex_runtime_bindings WHERE machineId=? AND binding=? AND capability=?",
    )
    .get(machineId, binding.binding, binding.capability);
  // Subscription tier can change while the authenticated person remains the same.
  const identity =
    account && typeof account === "object"
      ? Object.fromEntries(
          Object.entries(account)
            .filter(([key]) => key !== "planType")
            .sort(([a], [b]) => a.localeCompare(b)),
        )
      : account;
  const accountHash = hash(identity);
  if (
    !row ||
    (row.instanceId && row.instanceId !== info.instanceId) ||
    (row.accountHash && row.accountHash !== accountHash)
  )
    throw new HubError(
      409,
      "RUNTIME_IDENTITY_CHANGED",
      "Codex вернул другое подключение или аккаунт. Отправка не повторялась.",
    );
  store.db
    .prepare("UPDATE codex_runtime_bindings SET instanceId=?,accountHash=? WHERE machineId=?")
    .run(info.instanceId!, accountHash, machineId);
}
