import { db, newId, now, type Folder } from "./schema";

export async function createFolder(name: string, parentId: string | null = null): Promise<Folder> {
  const f: Folder = { id: newId(), name, parentId, createdAt: now() };
  await db.folders.add(f);
  return f;
}

export async function listFolders(): Promise<Folder[]> {
  return (await db.folders.toArray()).sort((a, b) => a.createdAt - b.createdAt);
}

export async function renameFolder(id: string, name: string): Promise<void> {
  await db.folders.update(id, { name });
}

export async function deleteFolder(id: string): Promise<void> {
  await db.transaction("rw", db.folders, db.notebooks, async () => {
    const f = await db.folders.get(id);
    if (!f) return;
    await db.notebooks.where("folderId").equals(id).modify({ folderId: f.parentId });
    await db.folders.where("parentId").equals(id).modify({ parentId: f.parentId });
    await db.folders.delete(id);
  });
}
