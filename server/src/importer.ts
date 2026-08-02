import fs from "node:fs";
import YAML from "yaml";
import type { Store } from "./store.js";
import { mmssToSeconds } from "./time.js";

interface YamlClip {
  start: string;
  end: string;
  tags?: string[];
  note?: string;
}

interface YamlVideo {
  hash: string;
  file: string;
  clips?: YamlClip[];
}

export interface YamlData {
  videos?: YamlVideo[];
}

export function importYamlData(store: Store, data: YamlData): boolean {
  if (store.getClips().length > 0) return false;
  for (const video of data.videos ?? []) {
    store.upsertVideo(video.hash, video.file);
    for (const clip of video.clips ?? []) {
      store.createClip(video.hash, {
        startSeconds: mmssToSeconds(clip.start),
        endSeconds: mmssToSeconds(clip.end),
        note: clip.note ?? "",
        tags: clip.tags ?? [],
      });
    }
  }
  return true;
}

export function migrateFromYamlFile(store: Store, yamlPath: string): boolean {
  const text = fs.readFileSync(yamlPath, "utf8");
  const data = (YAML.parse(text) ?? {}) as YamlData;
  return importYamlData(store, data);
}
