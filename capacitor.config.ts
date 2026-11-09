import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "app.opennote.notes",
  appName: "OpenNote",
  webDir: "dist",
  backgroundColor: "#121318",
  android: { allowMixedContent: false },
};

export default config;
