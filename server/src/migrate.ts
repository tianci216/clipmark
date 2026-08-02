import fs from "node:fs";
import path from "node:path";
import { DB_RELATIVE_PATH, findRepoRoot } from "./config.js";
import { migrateFromYamlFile } from "./importer.js";
import { Store } from "./store.js";

const repoRoot = findRepoRoot();
const dbPath = path.join(repoRoot, DB_RELATIVE_PATH);
const yamlPath = path.join(repoRoot, "annotations.yaml");

if (!fs.existsSync(yamlPath)) {
  console.error(`No annotations.yaml found at ${yamlPath}`);
  process.exit(1);
}

fs.mkdirSync(path.dirname(dbPath), { recursive: true });
const store = Store.open(dbPath);
const imported = migrateFromYamlFile(store, yamlPath);
if (imported) {
  const videos = store.getVideos();
  const clips = store.getClips();
  console.log(
    `Migrated ${videos.length} videos and ${clips.length} clips from ${yamlPath} into ${dbPath}`,
  );
} else {
  console.log(
    `Database ${dbPath} already contains clips; skipping. Delete it to re-import from ${yamlPath}.`,
  );
}
store.close();
