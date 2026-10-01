/** A missing final is watchable history, not evidence of an active response. */
export class GptHistoryWatch {
  private entries = new Map<string, { checkedAt: number; changedAt: number; openedAt: number }>();
  constructor(private now = Date.now) {}
  observe(id: string, pending: boolean, changedAt: number) {
    if (!pending) {
      this.entries.delete(id);
      return;
    }
    const old = this.entries.get(id);
    this.entries.set(id, { checkedAt: this.now(), changedAt, openedAt: old?.openedAt ?? 0 });
    while (this.entries.size > 32) this.entries.delete(this.entries.keys().next().value!);
  }
  active(id: string) {
    const old = this.entries.get(id);
    if (old) old.openedAt = this.now();
  }
  due() {
    const now = this.now();
    const selected = [...this.entries]
      .filter(([, entry]) => {
        const age = now - Math.max(entry.changedAt, entry.openedAt);
        const interval =
          age < 120000
            ? 30000
            : age < 300000
              ? 60000
              : age < 900000
                ? 120000
                : age < 3600000
                  ? 300000
                  : 900000;
        return now - entry.checkedAt >= interval;
      })
      .sort((a, b) => a[1].checkedAt - b[1].checkedAt)
      .slice(0, 2);
    for (const [, entry] of selected) entry.checkedAt = now;
    return selected.map(([id]) => id);
  }
}
