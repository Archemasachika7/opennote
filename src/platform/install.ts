import { Capacitor } from "@capacitor/core";
import { setPlatform } from "./port";
import type { CapacitorDeps } from "./capacitor";

/** Called once at startup: on Android (Capacitor) use native file saving + share sheet. */
export async function installPlatform(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  const [{ Filesystem, Directory }, { Share }, { createCapacitorPort }] = await Promise.all([
    import("@capacitor/filesystem"), import("@capacitor/share"), import("./capacitor"),
  ]);
  // Directory is a string enum in the plugin types; the adapter only needs the string values.
  const deps = { Filesystem, Share, Directory: { Documents: Directory.Documents, Cache: Directory.Cache } } as unknown as CapacitorDeps;
  setPlatform(createCapacitorPort(deps));
}
