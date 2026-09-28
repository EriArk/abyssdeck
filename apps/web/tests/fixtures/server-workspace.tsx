import { createRoot } from "react-dom/client";
import { TeamMachines } from "../../src/TeamMachines";
import "../../src/styles.css";
import "../../src/themes.css";
import "../../src/fonts.css";
import "../../src/materials.css";
import "../../src/polymer.css";
import "../../src/accent-colors.css";

createRoot(document.getElementById("root")!).render(
  <main style={{ maxWidth: 680, margin: "24px auto", padding: 16 }}>
    <h2>Подключения</h2>
    <TeamMachines visible />
  </main>,
);
