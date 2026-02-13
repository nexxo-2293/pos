export const electronDB = {
  async getConfig(key: string) {
    if (!window.pos) return null;
    return window.pos.getConfig(key);
  },

  async saveConfig(key: string, value: any) {
    if (!window.pos) return;
    return window.pos.saveConfig(key, value);
  }
};
