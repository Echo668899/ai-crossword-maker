import { resolveMakerPaperSize, type MakerPaperSize } from "./maker-paper";

const DB_NAME = "acm-maker";
const STORE = "drafts";
const DRAFT_KEY = "current";

export interface MakerDraftV1 {
  version: 1;
  mode: "topic" | "words" | "manual" | "paste" | "import";
  topic: string;
  wordCount: number;
  difficulty: "easy" | "medium" | "hard";
  rawEntries: Array<{ answer: string; clue: string }>;
  seed: number;
  title: string;
  updatedAt: string;
  /** Student/answer PDF paper size. Optional on drafts saved before this field existed. */
  paper?: MakerPaperSize;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveDraft(draft: MakerDraftV1): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(draft, DRAFT_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function loadDraft(): Promise<MakerDraftV1 | null> {
  if (typeof indexedDB === "undefined") return null;
  const db = await openDb();
  const value = await new Promise<MakerDraftV1 | null>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(DRAFT_KEY);
    req.onsuccess = () => resolve((req.result as MakerDraftV1) ?? null);
    req.onerror = () => reject(req.error);
  });
  db.close();
  if (!value) return null;
  return { ...value, paper: resolveMakerPaperSize(value.paper) };
}
