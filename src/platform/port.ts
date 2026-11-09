import { platform as web } from "./web";

export interface PlatformPort {
  saveFile(name: string, data: Blob): Promise<void>;
  openFile(accept: string[]): Promise<File | null>;
  openFiles(accept: string[]): Promise<File[]>;
  requestPersistentStorage(): Promise<boolean>;
}

let current: PlatformPort = web;

/** Stable facade; the shell (web, Capacitor, Tauri) installs its implementation at startup. */
export const platform: PlatformPort = {
  saveFile: (name, data) => current.saveFile(name, data),
  openFile: (accept) => current.openFile(accept),
  openFiles: (accept) => current.openFiles(accept),
  requestPersistentStorage: () => current.requestPersistentStorage(),
};

export function setPlatform(p: PlatformPort): void { current = p; }
