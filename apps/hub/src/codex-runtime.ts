import { createHash, randomBytes } from "node:crypto";
import { HubError, type MachineConfig } from "@codex-web/shared";
import type { Store } from "./store.js";

export type RuntimeBinding = { capability: string; binding: string; cwd: string; create: boolean };
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
// Account/read also contains presentation metadata. Only documented non-identity
// fields may be omitted; unknown fields remain fail-closed on protocol changes.
function accountIdentity(account: unknown, legacy = false) {
  return account && typeof account === "object" && !Array.isArray(account)
    ? Object.fromEntries(
        Object.entries(account)
          .filter(([key]) => key !== "planType" && (legacy || key !== "workspaceName"))
          .sort(([a], [b]) => a.localeCompare(b)),
      )
    : account;
}
export function codexAccountHash(account: unknown): string {
  return hash(accountIdentity(account));
}
export function codexAccountMatches(expected: string, account: unknown): boolean {
  // Upgrade a previously stored full-metadata fingerprint only when its exact
  // observed value still matches. Never accept a different person/provider.
  return (
    expected === codexAccountHash(account) || expected === hash(accountIdentity(account, true))
  );
}

/** A Linux transport migration retains the existing machine/account boundary. */
export function confirmLinuxAccount(store: Store, machine: MachineConfig, account: unknown) {
  if (machine.type !== "ssh-linux") return;
  const previous = store.db
    .prepare("SELECT accountHash FROM codex_runtime_bindings WHERE machineId=?")
    .get(machine.id);
  if (previous?.accountHash && !codexAccountMatches(String(previous.accountHash), account))
    throw new HubError(
      409,
      "RUNTIME_IDENTITY_CHANGED",
      "На компьютере открыт другой аккаунт Codex. История и отправки сохранены.",
    );
  const accountHash = codexAccountHash(account);
  if (previous)
    store.db
      .prepare("UPDATE codex_runtime_bindings SET accountHash=? WHERE machineId=?")
      .run(accountHash, machine.id);
  else
    store.db
      .prepare(
        "INSERT INTO codex_runtime_bindings(machineId,binding,capability,accountHash) VALUES(?,?,?,?)",
      )
      .run(
        machine.id,
        hash([machine.id, machine.type, machine.ssh]),
        randomBytes(32).toString("hex"),
        accountHash,
      );
}
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
  const accountHash = codexAccountHash(account);
  if (
    !row ||
    (row.instanceId && row.instanceId !== info.instanceId) ||
    (row.accountHash && !codexAccountMatches(String(row.accountHash), account))
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
