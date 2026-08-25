import fs from "node:fs";
import path from "node:path";
import { createApp } from "./app.js";
import { HOST, PORT, findDataDir } from "./config.js";
import { getLibraryFolder } from "./settings.js";
import { Store } from "./store.js";

const dataDir = findDataDir();
const dbPath = path.join(dataDir, "clipmark.db");
const thumbnailDir = path.join(dataDir, "thumbnails");

fs.mkdirSync(path.dirname(dbPath), { recursive: true });
const store = Store.open(dbPath);
const app = createApp({ store, thumbnailDir, port: PORT });

app.listen(PORT, HOST, () => {
  const folder = getLibraryFolder(store);
  console.log(
    folder
      ? `Clipmark Library Folder: ${folder}`
      : "Clipmark has no Library Folder yet — open Settings in the app to choose one.",
  );
  console.log(`Listening on http://${HOST}:${PORT}`);
});
