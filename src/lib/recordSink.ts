// Where a recording saves itself (Recorder.svelte), so the player needn't
// press Save: a folder they pick once (the File System Access API, Chrome
// and Edge), written to as the recording grows. The folder is remembered in
// this browser (IndexedDB: a folder's handle can't go in localStorage); the
// browser may ask once a visit to keep writing there, unless the player told
// it to allow it on every visit. Elsewhere (Firefox, Safari) it downloads the
// file at the end of each game instead.

import { STORE } from './storage';

/** Whether this browser can write into a folder the player picks. */
export const canPickFolder = typeof window !== 'undefined' && 'showDirectoryPicker' in window;

type Folder = FileSystemDirectoryHandle & {
  queryPermission(o: { mode: 'readwrite' }): Promise<PermissionState>;
  requestPermission(o: { mode: 'readwrite' }): Promise<PermissionState>;
};

const DB = `${STORE}recorder`;
const KEY = 'folder';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore('handles');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function kept(): Promise<Folder | null> {
  try {
    const db = await open();
    return await new Promise((resolve) => {
      const req = db.transaction('handles').objectStore('handles').get(KEY);
      req.onsuccess = () => resolve((req.result as Folder) ?? null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

async function keep(f: Folder) {
  try {
    const db = await open();
    db.transaction('handles', 'readwrite').objectStore('handles').put(f, KEY);
  } catch {
    /* not kept: picked again next time */
  }
}

/** The folder picked before: `ready` to write to now, or waiting for the player's yes (a click) this visit; null if none. */
export async function lastFolder(): Promise<{ folder: Folder; ready: boolean } | null> {
  const f = await kept();
  if (!f) return null;
  try {
    return { folder: f, ready: (await f.queryPermission({ mode: 'readwrite' })) === 'granted' };
  } catch {
    return null;
  }
}

/** Asks for a folder (a click's work), or for the yes to keep writing to the last one. Null if the player says no. */
export async function chooseFolder(last?: Folder | null): Promise<Folder | null> {
  try {
    if (last && (await last.requestPermission({ mode: 'readwrite' })) === 'granted') return last;
    const f = (await (window as unknown as { showDirectoryPicker(o: object): Promise<Folder> }).showDirectoryPicker({ id: 'poe2-recordings', mode: 'readwrite' })) as Folder;
    await keep(f);
    return f;
  } catch {
    return null;
  }
}

/** Writes `text` as `name` in `folder` (over what was there). False if it couldn't. */
export async function writeTo(folder: Folder, name: string, text: string): Promise<boolean> {
  try {
    const file = await folder.getFileHandle(name, { create: true });
    const w = await file.createWritable();
    await w.write(text);
    await w.close();
    return true;
  } catch {
    return false;
  }
}

export type { Folder };
