import type { Download } from "./api";

/** What the shell needs to render and drive Downloads — built in App, used by the TopBar and the feed. */
export interface DownloadControls {
  /** Every subfolder of the Library Folder, for the popover's picker. */
  folders: string[];
  /** Downloads not yet finished — the badge count. */
  activeCount: number;
  /** Ids of landed Downloads whose Video the refetch has not shown yet. */
  scanning: Set<number>;
  onStart: (url: string, folder: string) => Promise<void>;
  onRemove: (download: Download) => void;
}
