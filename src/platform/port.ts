export interface PlatformPort {
  saveFile(name: string, data: Blob): Promise<void>;
  openFile(accept: string[]): Promise<File | null>;
  requestPersistentStorage(): Promise<boolean>;
}
export { platform } from "./web";
