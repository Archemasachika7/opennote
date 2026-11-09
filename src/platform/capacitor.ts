import type { PlatformPort } from "./port";
import { platform as web } from "./web";

export type CapacitorDeps = {
  Filesystem: { writeFile(o: { path: string; data: string; directory: string; recursive?: boolean }): Promise<{ uri: string }> };
  Share: { share(o: { title?: string; url?: string; dialogTitle?: string }): Promise<unknown> };
  Directory: { Documents: string; Cache: string };
};

async function toBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** Android/iOS: downloads do not exist in the WebView, so files are written to Documents/OpenNote and shared. */
export function createCapacitorPort(d: CapacitorDeps): PlatformPort {
  return {
    ...web,
    async saveFile(name, data) {
      const base = { path: `OpenNote/${name}`, data: await toBase64(data), recursive: true };
      let uri: string;
      try {
        uri = (await d.Filesystem.writeFile({ ...base, directory: d.Directory.Documents })).uri;
      } catch {
        uri = (await d.Filesystem.writeFile({ ...base, directory: d.Directory.Cache })).uri;
      }
      await d.Share.share({ title: name, url: uri, dialogTitle: `Share ${name}` }).catch(() => undefined);
    },
  };
}
