import { useEffect, useState } from "react";
import { CloudOff, Smartphone, Trash2 } from "lucide-react";
import type { Notebook } from "../store/schema";
import { Sheet } from "../ui/Sheet";
import { trashNotebook } from "../store/notebooks";
import { deleteEverywhere, isSynced, removeFromDevice } from "../sync/deletion";
import { BACKUP_EXT, exportBackup } from "../io/backup";
import { platform } from "../platform/port";
import { toast } from "../ui/Toast";
import { blotReact } from "../ui/blotBus";
import { syncNow } from "../sync/run";

type Choice = "trash" | "device" | "everywhere";
const IC = { size: 18, strokeWidth: 1.5 } as const;
const fileName = (t: string) => (t.replace(/[<>:"/\\|?*]+/g, "-").trim() || "notebook") + BACKUP_EXT;

const CONFIRM: Record<Choice, string> = { trash: "Move to Trash", device: "Remove from this device", everywhere: "Delete everywhere" };

/**
 * One place to decide what "delete" means with sync on:
 * Trash (all devices, 30 days), this device only (the account and other devices keep it), or
 * everywhere for good. Optionally save a .opennote copy to a file first.
 */
export function DeleteSheet({ notebooks, inTrash, onClose, onDone }: {
  notebooks: Notebook[] | null; inTrash: boolean; onClose: () => void; onDone?: () => void;
}) {
  const open = !!notebooks && notebooks.length > 0;
  const [choice, setChoice] = useState<Choice>(inTrash ? "everywhere" : "trash");
  const [saveCopy, setSaveCopy] = useState(false);
  const [synced, setSynced] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setChoice(inTrash ? "everywhere" : "trash");
    setSaveCopy(false);
    setBusy(false);
    let alive = true;
    void Promise.all(notebooks!.map((n) => isSynced(n.id))).then((r) => { if (alive) setSynced(r.every(Boolean)); });
    return () => { alive = false; };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const name = notebooks?.length === 1 ? `“${notebooks[0].title}”` : `${notebooks?.length ?? 0} notebooks`;
  const notSynced = synced === false;

  const options: { id: Choice; title: string; hint: string; icon: JSX.Element; hidden?: boolean }[] = [
    { id: "trash", title: "Move to Trash", hint: "On all your devices. You can restore it for 30 days.", icon: <Trash2 {...IC} />, hidden: inTrash },
    {
      id: "device", title: "Remove from this device only",
      hint: notSynced
        ? "This isn't synced yet, so this would delete the only copy. Save a copy to a file first."
        : "Your account and other devices keep it. Get it back any time from Account → Sync.",
      icon: <Smartphone {...IC} />,
    },
    { id: "everywhere", title: "Delete everywhere", hint: "From this device, your account and every signed-in device. This can't be undone.", icon: <CloudOff {...IC} /> },
  ];

  async function run() {
    if (!notebooks) return;
    setBusy(true);
    try {
      if (saveCopy) {
        for (const n of notebooks) await platform.saveFile(fileName(n.title), await exportBackup(n.id));
      }
      for (const n of notebooks) {
        if (choice === "trash") await trashNotebook(n.id);
        else if (choice === "device") await removeFromDevice(n.id);
        else await deleteEverywhere(n.id);
      }
      toast(choice === "trash" ? `Moved ${name} to Trash` : choice === "device" ? `Removed ${name} from this device` : `Deleted ${name} everywhere`);
      blotReact("wave");
      if (choice !== "device") void syncNow().catch(() => undefined); // tell the other devices now, not in a minute
      onDone?.();
      onClose();
    } catch (e) {
      toast(`Couldn't delete: ${e instanceof Error ? e.message : String(e)}`);
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title={inTrash ? "Delete forever" : "Delete"} width={500}>
      <p className="dim" style={{ marginTop: 0 }}>What should happen to {name}?</p>
      <div className="delete-options" role="radiogroup" aria-label="How to delete">
        {options.filter((o) => !o.hidden).map((o) => (
          <button key={o.id} type="button" role="radio" aria-checked={choice === o.id}
            className={`delete-option ${choice === o.id ? "on" : ""} ${o.id === "everywhere" ? "danger" : ""}`}
            onClick={() => { setChoice(o.id); if (o.id === "device" && notSynced) setSaveCopy(true); }}>
            <span className="delete-icon" aria-hidden>{o.icon}</span>
            <span className="delete-text"><span className="delete-title">{o.title}</span><span className="delete-hint">{o.hint}</span></span>
          </button>
        ))}
      </div>
      {choice !== "trash" && (
        <label className="delete-copy">
          <input type="checkbox" checked={saveCopy} onChange={(e) => setSaveCopy(e.target.checked)} />
          Save a copy to a file first ({BACKUP_EXT}, opens again with Import)
        </label>
      )}
      <div className="row-end">
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className={`btn ${choice === "trash" ? "primary" : "danger"}`} disabled={busy} onClick={() => void run()}>
          {CONFIRM[choice]}
        </button>
      </div>
    </Sheet>
  );
}
