import { spawn } from "node:child_process";
import {
  type FileLaunchRequest,
  type FileLaunchResponse,
  HubError,
  type MachineConfig,
} from "@codex-web/shared";
import { authorizeMachine } from "./authority.js";
import { quotePowerShell, stopProcess } from "./index.js";
import { verifyProjectRoot } from "./projectRoots.js";

const messages: Record<string, string> = {
  LAUNCH_UNAVAILABLE: "Не удалось связаться с помощником запуска на компьютере.",
  LAUNCH_POLICY: "Политика Windows не разрешает запуск PowerShell-скриптов на этом компьютере.",
  LAUNCH_PATH: "Файл должен находиться внутри рабочей папки проекта без перенаправлений.",
  LAUNCH_CHANGED: "Файл изменился. Открой текущую версию в Файлах перед запуском.",
  LAUNCH_FORMAT: "Этот файл нельзя запустить выбранным обработчиком Windows.",
  LAUNCH_BUSY: "Предыдущий запуск ещё проверяется. Дождись его состояния.",
  LAUNCH_EXPIRED: "Время подготовки истекло. Повторного запуска не было.",
  LAUNCH_UNKNOWN: "Состояние запуска не подтверждено. Повторного запуска не было.",
  LAUNCH_FAILED: "Windows не удалось запустить этот файл.",
  LAUNCH_MISSING: "Квитанция запуска на компьютере не найдена. Повторного запуска не было.",
  LAUNCH_KEY_REUSED: "Эта квитанция относится к другому запуску.",
  LAUNCH_CAPACITY: "Хранилище квитанций запуска заполнено.",
};
export const fileLaunchMessage = (code: string) => messages[code] ?? messages.LAUNCH_UNAVAILABLE!;
export async function runFileLaunch(
  machine: MachineConfig,
  root: string,
  request: FileLaunchRequest,
): Promise<FileLaunchResponse> {
  await verifyProjectRoot(machine, root);
  authorizeMachine(machine);
  if (machine.type !== "ssh-windows" || !machine.ssh || !machine.codex.activityNode) {
    throw new HubError(409, "LAUNCH_UNAVAILABLE", fileLaunchMessage("LAUNCH_UNAVAILABLE"));
  }
  const script = `$ErrorActionPreference='Stop'; $worker=Join-Path $env:LOCALAPPDATA 'CodexWeb/file-launch/FileLaunchWorker.cjs'; if(-not(Test-Path -LiteralPath $worker)){Write-Output '{"ok":false,"code":"LAUNCH_UNAVAILABLE"}'; exit 0}; & ${quotePowerShell(machine.codex.activityNode)} $worker request; exit $LASTEXITCODE`;
  const child = spawn(
    "ssh",
    [
      ...(machine.ssh.configFile ? ["-F", machine.ssh.configFile] : []),
      "-T",
      "-o",
      "BatchMode=yes",
      "-o",
      "StrictHostKeyChecking=yes",
      "-o",
      "ConnectTimeout=8",
      machine.ssh.target,
      "powershell.exe",
      "-NoLogo",
      "-NoProfile",
      "-NonInteractive",
      "-EncodedCommand",
      Buffer.from(script, "utf16le").toString("base64"),
    ],
    { stdio: "pipe", detached: process.platform !== "win32", windowsHide: true },
  );
  return new Promise((resolve, reject) => {
    let output = "",
      done = false;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      stopProcess(child);
      try {
        if (!ok) throw Error();
        const result = JSON.parse(output);
        if (!result.ok)
          throw new HubError(
            409,
            messages[result.code] ? result.code : "LAUNCH_UNAVAILABLE",
            fileLaunchMessage(result.code),
          );
        authorizeMachine(machine);
        resolve(result.value);
      } catch (e) {
        reject(
          e instanceof HubError
            ? e
            : new HubError(503, "LAUNCH_UNAVAILABLE", fileLaunchMessage("LAUNCH_UNAVAILABLE")),
        );
      }
    };
    const timer = setTimeout(() => finish(false), 30000);
    child.stdout.on("data", (b) => {
      output += b.toString("utf8");
      if (output.length > 65536) finish(false);
    });
    child.stderr.on("data", () => {});
    child.stdin.on("error", () => finish(false));
    child.on("error", () => finish(false));
    child.on("close", (code) => finish(code === 0));
    child.stdin.end(JSON.stringify({ root, request }));
  });
}
