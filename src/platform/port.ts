export interface PlatformPort {
  saveFile(name: string, data: Blob): Promise<void>;
  openFile(accept: string[]): Promise<File | null>;
  openFiles(accept: string[]): Promise<File[]>;
  requestPersistentStorage(): Promise<boolean>;
}
export { platform } from "./web";
