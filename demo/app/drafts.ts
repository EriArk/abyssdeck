// The website edition never opens the installed application's IndexedDB database.
const drafts = new Map<string, string>();
export const githubDraftStorage = {
  async getItem(key: string) {
    return drafts.get(key) ?? null;
  },
  async setItem(key: string, value: string) {
    drafts.set(key, value);
  },
  async removeItem(key: string) {
    drafts.delete(key);
  },
};
