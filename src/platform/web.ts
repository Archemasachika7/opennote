import type { PlatformPort } from "./port";

export const platform: PlatformPort = {
  async saveFile(name, data) {
    const url = URL.createObjectURL(data);
    const a = Object.assign(document.createElement("a"), { href: url, download: name });
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
  openFile(accept) {
    return new Promise((resolve) => {
      const input = Object.assign(document.createElement("input"), { type: "file", accept: accept.join(",") });
      input.onchange = () => resolve(input.files?.[0] ?? null);
      input.addEventListener("cancel", () => resolve(null));
      input.click();
    });
  },
  openFiles(accept) {
    return new Promise((resolve) => {
      const input = Object.assign(document.createElement("input"), { type: "file", accept: accept.join(","), multiple: true });
      input.onchange = () => resolve([...(input.files ?? [])]);
      input.addEventListener("cancel", () => resolve([]));
      input.click();
    });
  },
  async requestPersistentStorage() {
    return (await navigator.storage?.persist?.()) ?? false;
  },
};
