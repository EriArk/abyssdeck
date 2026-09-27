import { z } from "zod";

export const fileLaunchReceiptSchema = z.object({
  id: z.string().uuid(),
  state: z.enum(["queued", "launching", "running", "exited", "failed", "unknown"]),
  pid: z.number().int().positive().optional(),
  exitCode: z.number().int().optional(),
  code: z.string().max(80).optional(),
});
export type FileLaunchReceipt = z.infer<typeof fileLaunchReceiptSchema>;
export const runnableFile = (name: string) => /\.(exe|bat|cmd|ps1)$/i.test(name);
export type FileLaunchPrepared = {
  id: string;
  projectId: string;
  projectName: string;
  machineId: string;
  machineName: string;
  path: string;
  handler: "exe" | "cmd" | "ps1";
  sha256: string;
  bytes: number;
  unverified?: boolean;
  changed: boolean;
  expiresAt: number;
  remoteAvailable: boolean;
};
export type FileLaunchOperation = FileLaunchReceipt & { prepared: FileLaunchPrepared };
export type FileLaunchRequest =
  | { op: "prepare"; path: string }
  | { op: "start"; id: string; path: string; sha256: string; bytes: number; expiresAt: number }
  | { op: "status"; id: string };
export type FileLaunchResponse =
  | FileLaunchReceipt
  | { path: string; handler: "exe" | "cmd" | "ps1"; sha256: string; bytes: number };
