import { createRoot } from "react-dom/client";
import { ActivityBadge } from "../../src/ActivityBadge";
import "../../src/styles.css";
import "../../src/workspace.css";

createRoot(document.getElementById("root")!).render(
  <main>
    <div data-case="mixed">
      <ActivityBadge active={1} unread={1} />
    </div>
    <div data-case="success">
      <ActivityBadge unread={1} failed={false} />
    </div>
    <div data-case="failure">
      <ActivityBadge unread={1} failed />
    </div>
    <div data-case="waiting">
      <ActivityBadge active={1} waiting={1} unread={2} />
    </div>
    <div data-case="empty">
      <ActivityBadge />
    </div>
    <div data-case="counts">
      <ActivityBadge counts />
    </div>
  </main>,
);
