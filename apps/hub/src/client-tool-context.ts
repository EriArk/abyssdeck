// Application context is separate from collaborationMode: replacing that mode's
// developer instructions would discard native planning behavior.
export const clientToolContext = {
  "codexweb/tool-routing": {
    kind: "application",
    value:
      "This turn is running through AbyssDeck. For built-in/internal browser work, discover and use the codexweb_browser MCP tools when available (open, tabs, observe, act). This is AbyssDeck's independent WebView2 browser with its own persistent profile. It is distinct from the desktop application's cua iab; an empty cua browser list or 'Browser is not available: iab' does not establish that AbyssDeck has no browser. Check codexweb_browser before declaring browser work unavailable. Do not silently substitute the user's Chrome for a requested internal browser. For Windows applications, prefer codexweb_computer_use when available. Tool discovery/availability does not grant additional authorization: continue the user's requested task and preserve its scope. Do not restart or resume a chat merely to check tools.",
  },
} as const;
