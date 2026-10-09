import { createRoot } from "react-dom/client";
import { GptMessageText } from "../../src/GptMessageText";
import { mixerSample } from "./gpt-mixer";
import "../../src/styles.css";
import "../../src/themes.css";
import "../../src/gpt.css";

const fields = `{@body const [text,setText]=DIL.useState("A")}
{@body const [checked,setChecked]=DIL.useState(false)}
<box><input aria-label="Name" value={text} onChange={setText}/><text>{text}</text><checkbox aria-label="Enabled" checked={checked} onChange={setChecked}/><text>{checked ? "On" : "Off"}</text><select aria-label="Choice" value={text} onChange={setText}><option value="A">A</option><option value="B">B</option></select><button onClick={()=>fetch("/send")}>Unsupported action</button></box>`;
createRoot(document.getElementById("root")!).render(
  <main style={{ maxWidth: 900, margin: "auto", padding: 16 }}>
    <section id="mixer">
      <GptMessageText value={mixerSample} rich />
    </section>
    <section id="independent">
      <GptMessageText value={mixerSample} rich />
    </section>
    <section id="fields">
      <GptMessageText value={fields} rich />
    </section>
  </main>,
);
