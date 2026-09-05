/**
 * Lightweight IndexedDB persistence for offline claim draft images.
 * Keeps large photo data URLs out of sessionStorage to avoid QuotaExceededError,
 * while allowing drafts to be fully restored across browser restarts and tab switches.
 */

const DB_NAME = "fp_drafts_db_v1";
const STORE_NAME = "draft_images";
const DB_VERSION = 1;
const DRAFT_KEY = "current_draft_evidence";

export interface DraftImagePayload {
  angleType: string;
  imageUrl?: string;
  timestamp?: string;
  lat?: number | null;
  lon?: number | null;
  accuracyM?: number | null;
  sha256?: string;
  qualityPassed?: boolean;
  lightingScore?: number;
  blurScore?: number;
}

function openDraftDb(): Promise<IDBDatabase | null> {
  if (typeof window === "undefined" || !("indexedDB" in window)) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function saveDraftImagesToDb(images: DraftImagePayload[]): Promise<boolean> {
  const db = await openDraftDb();
  if (!db) return false;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      store.put(images, DRAFT_KEY);
      tx.oncomplete = () => {
        db.close();
        resolve(true);
      };
      tx.onerror = () => {
        db.close();
        resolve(false);
      };
    } catch {
      db.close();
      resolve(false);
    }
  });
}

export async function loadDraftImagesFromDb(): Promise<DraftImagePayload[] | null> {
  const db = await openDraftDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(DRAFT_KEY);
      req.onsuccess = () => {
        db.close();
        resolve(Array.isArray(req.result) ? (req.result as DraftImagePayload[]) : null);
      };
      req.onerror = () => {
        db.close();
        resolve(null);
      };
    } catch {
      db.close();
      resolve(null);
    }
  });
}

export async function clearDraftImagesFromDb(): Promise<void> {
  const db = await openDraftDb();
  if (!db) return;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      store.delete(DRAFT_KEY);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        resolve();
      };
    } catch {
      db.close();
      resolve();
    }
  });
}
