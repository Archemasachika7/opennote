/** Where one encrypted chunk lives. Telegram: "fileId|messageId"; Supabase Storage: the object path. */
export interface ChunkRef { ref: string; size: number }

/** A place to keep encrypted chunks. It only ever sees ciphertext (see ../crypto.ts). */
export interface BlobStore {
  readonly provider: "supabase" | "telegram" | "pinata";
  put(objectId: string, chunks: Uint8Array[]): Promise<ChunkRef[]>;
  get(refs: ChunkRef[]): Promise<Uint8Array[]>;
  remove(refs: ChunkRef[]): Promise<void>;
}
