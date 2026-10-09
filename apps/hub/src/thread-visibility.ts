/** Presentation queries using the threads alias `t`. Never use this to decide
 * whether native work may be interrupted: hidden history can retain receipts. */
export const visibleCodexThreadSql = `t.archived=0 AND NOT EXISTS(
  SELECT 1 FROM library_entities e
  WHERE e.client='codex' AND e.kind='thread'
    AND (e.id=t.codexThreadId OR e.id=t.id OR json_extract(e.value,'$.localId')=t.id)
    AND (json_extract(e.value,'$.deleted')=1 OR json_extract(e.value,'$.archived')=1)
)`;
