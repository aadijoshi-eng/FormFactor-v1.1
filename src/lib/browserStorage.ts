export interface WritableStorage {
  setItem(key: string, value: string): void;
}

export function safeSetStorage(storage: WritableStorage | null | undefined, key: string, value: unknown): boolean {
  if (!storage) return false;
  try {
    storage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
