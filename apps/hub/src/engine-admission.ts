import { readFileSync } from "node:fs";
import { join } from "node:path";

/** Background discovery must wait until the candidate passes checkpoint admission. */
export function engineAdmissionPending() {
  const root = process.env.HUB_RELEASE_ROOT;
  if (process.env.HUB_ROLE !== "engine" || !root) return false;
  try {
    const state = JSON.parse(readFileSync(join(root, "maintenance.json"), "utf8"));
    return (
      state.kind === "engine" &&
      state.state === "installing" &&
      state.revision === process.env.HUB_REVISION
    );
  } catch (error) {
    // A first installation has no maintenance record. Corrupt/unreadable admission
    // state must not admit background mutations while the gateway is closed.
    return (error as NodeJS.ErrnoException).code !== "ENOENT";
  }
}
