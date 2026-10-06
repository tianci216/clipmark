/** A per-device boolean in browser storage. Every call is wrapped: unavailable storage reads as false. */
type FlagStorage = Pick<Storage, "getItem" | "setItem">;

function defaultStorage(): FlagStorage | undefined {
  return typeof localStorage === "undefined" ? undefined : localStorage;
}

export function readFlag(key: string, storage: FlagStorage | undefined = defaultStorage()): boolean {
  try {
    return storage?.getItem(key) === "1";
  } catch {
    return false;
  }
}

export function writeFlag(key: string, value: boolean, storage: FlagStorage | undefined = defaultStorage()): void {
  try {
    storage?.setItem(key, value ? "1" : "0");
  } catch {
    // Private mode / blocked storage: the flag just isn't remembered.
  }
}
