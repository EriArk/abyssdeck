import type { CSSProperties } from "react";

const paths: Record<string, string[]> = {
  heading: ["M5 4v16M19 4v16M5 12h14"],
  bold: ["M6 3h7a4 4 0 0 1 0 8H6V3Zm0 8h8a5 5 0 0 1 0 10H6V11Z"],
  italic: ["M10 3h10M4 21h10M15 3 9 21"],
  quote: ["M4 5h6v7H4V5Zm0 7c0 5 2 6 5 7M14 5h6v7h-6V5Zm0 7c0 5 2 6 5 7"],
  line: ["M3 5h2M3 12h2M3 19h2M9 5h12M9 12h12M9 19h12"],
  fold: ["M3 3h18M3 21h18M7 7l5 4 5-4M7 17l5-4 5 4"],
  unfold: ["M3 3h18M3 21h18M7 11l5-4 5 4M7 13l5 4 5-4"],
  marker: ["m4 14 10-10 6 6-10 10-6-6ZM6 16l-3 5h6M12 6l6 6"],
  arrow: ["M4 20 20 4M9 4h11v11"],
  rectangle: ["M3 5h18v14H3z"],
  text: ["M3 4h18M12 4v17M8 21h8"],
  crop: ["M6 2v16h16M2 6h16v16"],
  rotate: ["M4 8V3m0 5h5M4 8a9 9 0 1 1-1 8"],
  save: ["M4 3h13l4 4v14H3V3h1ZM7 3v6h9V3M7 21v-8h10v8"],
  "file-plus": ["M14 2H5v20h14V7l-5-5Z", "M14 2v5h5M8 14h8M12 10v8"],
  "folder-plus": ["M3 6V4h6l2 3h10v13H3V6Z", "M8 13h8M12 9v8"],
  upload: ["M12 16V3m-5 5 5-5 5 5M3 16v5h18v-5"],
  scissors: [
    "M7 7a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM7 17a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM7 8l14 13M7 16 21 3",
  ],
  paste: ["M9 4H5v18h14V4h-4M9 2h6v5H9zM8 12h8M8 16h8"],
  select: ["M3 3h18v18H3zM7 12l3 3 7-7"],
  wrap: ["M3 5h18M3 10h13a4 4 0 0 1 0 8h-5m3-3-3 3 3 3M3 15h4M3 20h4"],
  code: ["m8 5-6 7 6 7m8-14 6 7-6 7m-3-17-2 20"],
  grid: ["M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z"],
  key: ["M14 3a7 7 0 0 0-6 10L2 19v3h4v-3h3v-3l2-2A7 7 0 1 0 14 3ZM17 7h.01"],
  schedule: ["M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM12 7v5l3 2"],
  bell: ["M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"],
  person: ["M20 21v-2a6 6 0 0 0-6-6h-4a6 6 0 0 0-6 6v2M16 6a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z"],
  people: [
    "M14 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75M12 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z",
  ],
  link: [
    "m10 13 4-4M8 16l-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0M16 8l1-1a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0",
  ],
  microphone: ["M9 5a3 3 0 0 1 6 0v7a3 3 0 0 1-6 0V5ZM5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8"],
  terminal: ["M3 4h18v16H3z", "m6 8 4 4-4 4m7 0h5"],
  server: ["M3 3h18v7H3zM3 14h18v7H3zM7 6h.01M7 17h.01M11 6h6M11 17h6"],
  power: ["M12 2v10M6 5a9 9 0 1 0 12 0"],
  repository: ["M3 7V4h6l2 3h10v13H3V7Z", "m10 11-3 3 3 3m4-6 3 3-3 3"],
  branch: ["M6 5v14M6 13h7a5 5 0 0 0 5-5V5", "M4 3h4v4H4zM16 3h4v4h-4zM4 17h4v4H4z"],
  tag: ["M3 3h8l10 10-8 8L3 11V3Z", "M7 7h.01"],
  external: ["M14 3h7v7M21 3 10 14M10 5H3v16h16v-7"],
  speaker: ["M3 9h4l5-4v14l-5-4H3zM16 8a6 6 0 0 1 0 8M19 5a10 10 0 0 1 0 14"],
  play: ["m8 4 12 8-12 8V4Z"],
  pause: ["M8 5v14M16 5v14"],
  copy: ["M9 9h12v12H9zM15 9V3H3v12h6"],
  pin: ["m9 3 6 0-1 6 4 4v2H6v-2l4-4-1-6ZM12 15v7"],
  edit: ["m4 16 12-12 4 4-12 12-5 1 1-5ZM14 6l4 4"],
  "note-edit": [
    "M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M7 8h3M7 17h8",
    "m14 13 7-7-3-3-7 7-1 4 4-1ZM16 5l3 3",
  ],
  archive: ["M3 3h18v5H3zM5 8v13h14V8M9 12h6"],
  trash: ["M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7"],
  file: ["M6 2h8l4 4v16H6zM14 2v5h5M9 11h6M9 15h6"],
  search: ["M10.5 3a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15ZM16 16l5 5"],
  "arrow-down": ["m6 14 6 6 6-6M12 4v16"],
  "to-bottom": ["m6 10 6 6 6-6M12 3v13M5 21h14"],
  "arrow-up": ["m6 10 6-6 6 6M12 4v16"],
  trackpad: ["M3 5h18v14H3zM3 15h18M12 15v4"],
  touch: ["M10 12V4a2 2 0 0 1 4 0v7l3-1 4 3-3 8H9l-5-7a2 2 0 0 1 3-2l3 3"],
  more: ["M5 12h.01M12 12h.01M19 12h.01"],
  minus: ["M5 12h14"],
  help: ["M9 8a3 3 0 1 1 5 2c-2 1-2 2-2 3m0 4h.01M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Z"],
  menu: ["M4 6h16M4 12h16M4 18h16"],
  chat: [
    "M21 11.5a8.3 8.3 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.3 8.3 0 0 1-3.8-.9L3 21l1.9-5.7a8.3 8.3 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.3 8.3 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5Z",
  ],
  results: ["M7 3h10v18l-5-3-5 3V3Z"],
  "panel-right": ["M3 4h18v16H3zM15 4v16"],
  remote: ["M3 4h18v13H3zM8 21h8m-4-4v4"],
  plus: ["M12 5v14M5 12h14"],
  send: ["m5 12 7-7 7 7M12 5v15"],
  stop: ["M6 6h12v12H6z"],
  close: ["m6 6 12 12M6 18 18 6"],
  folder: ["M3 7V5h6l2 2h10v13H3V7Z"],
  chevron: ["m9 5 7 7-7 7"],
  back: ["m14 6-6 6 6 6"],
  settings: [
    "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z",
    "M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2",
  ],
  check: ["m5 12 4 4L19 6"],
  refresh: ["M20 7v5h-5M4 17v-5h5", "M6 7a7 7 0 0 1 11-1l3 6M4 12l3 6a7 7 0 0 0 11-1"],
  history: ["M3 11a9 9 0 1 1 2.5 7M3 4v7h7M12 7v5l3 2"],
  plan: ["M9 5h12M9 12h12M9 19h12M3 5h.01M3 12h.01M3 19h.01"],
  report: ["M4 3h16v18H4zM8 16v-4M12 16V8M16 16v-6"],
  activity: ["m3 12 4-7 5 14 5-14 4 7"],
  image: ["M3 3h18v18H3zM3 16l5-5 4 4 3-3 6 6M15 7h.01"],
  keyboard: ["M2 5h20v14H2zM6 9h.01M10 9h.01M14 9h.01M18 9h.01M7 15h10"],
  expand: ["M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"],
  logout: ["M9 5H4v14h5m5-14 5 7-5 7M9 12h10"],
  lock: ["M6 10h12v11H6zM8 10V6a4 4 0 0 1 8 0v4"],
  unlock: ["M6 10h12v11H6zM8 10V6a4 4 0 0 1 8 0"],
  pointer: ["m5 3 14 9-7 1-3 7-4-17Z"],
  moon: ["M20 15A8 8 0 0 1 9 4a8 8 0 1 0 11 11Z"],
};
export function Icon({
  name,
  size = 20,
  style,
}: {
  name: string;
  size?: number;
  style?: CSSProperties;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={style}
    >
      {(paths[name] ?? paths.chat ?? []).map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
