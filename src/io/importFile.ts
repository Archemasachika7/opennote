import type { Notebook } from "../store/schema";
import { BACKUP_EXT, importBackup } from "./backup";

/** Library "Import": .opennote backups now; PDFs are added in A5. */
export async function importFile(file: File): Promise<Notebook> {
  const name = file.name.toLowerCase();
  if (name.endsWith(BACKUP_EXT)) return importBackup(file);
  throw new Error("Choose a .opennote backup or a PDF.");
}
