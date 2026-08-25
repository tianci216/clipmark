import fs from "node:fs";
import path from "node:path";
import { createApp } from "./app.js";
import { HOST, PORT, findDataDir, resolveVideoDir } from "./config.js";
import { Store } from "./store.js";

const dataDir = findDataDir();
const dbPath = path.join(dataDir, "clipmark.db");
const thumbnailDir = path.join(dataDir, "thumbnails");
const videoDir = resolveVideoDir(process.argv);

fs.mkdirSync(path.dirname(dbPath), { recursive: true });
const store = Store.open(dbPath);
const app = createApp({ store, videoDir, thumbnailDir });

app.listen(PORT, HOST, () => {
  console.log(`Clipmark serving videos from: ${videoDir}`);
  console.log(`Listening on http://${HOST}:${PORT}`);
});
