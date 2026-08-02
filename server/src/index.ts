import fs from "node:fs";
import path from "node:path";
import { createApp } from "./app.js";
import { DB_RELATIVE_PATH, HOST, PORT, findRepoRoot, resolveVideoDir } from "./config.js";
import { Store } from "./store.js";

const repoRoot = findRepoRoot();
const dbPath = path.join(repoRoot, DB_RELATIVE_PATH);
const thumbnailDir = path.join(repoRoot, "data", "thumbnails");
const videoDir = resolveVideoDir(process.argv);

fs.mkdirSync(path.dirname(dbPath), { recursive: true });
const store = Store.open(dbPath);
const app = createApp({ store, videoDir, thumbnailDir });

app.listen(PORT, HOST, () => {
  console.log(`Clipmark serving videos from: ${videoDir}`);
  console.log(`Listening on http://${HOST}:${PORT}`);
});
