import { createApp } from "./app.js";
import { HOST, PORT, resolveVideoDir } from "./config.js";

const videoDir = resolveVideoDir(process.argv);
const app = createApp();

app.listen(PORT, HOST, () => {
  console.log(`Clipmark serving videos from: ${videoDir}`);
  console.log(`Listening on http://${HOST}:${PORT}`);
});
