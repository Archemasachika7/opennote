import type { Notebook } from "../store/schema";
import { BACKUP_EXT, importBackup } from "./backup";
import { importPdf } from "./pdfImport";

/** Library "Import": an .opennote backup becomes a copy; a PDF becomes a new annotatable notebook. */
export async function importFile(file: File, onProgress?: (done: number, total: number) => void): Promise<Notebook> {
  const name = file.name.toLowerCase();
  if (name.endsWith(BACKUP_EXT)) return importBackup(file);
  if (name.endsWith(".pdf") || file.type === "application/pdf") return (await importPdf(file, { onProgress })).notebook;
  throw new Error("Choose a .opennote backup or a PDF.");
}
