import { useEffect, useMemo, useState } from "react";
import { fetchClips, fetchVideos, type Clip, type Video } from "./lib/api";
import { LibraryView, type Tab } from "./lib/LibraryView";
import { buildTagIndex } from "./lib/tags";

export function App() {
  const [videos, setVideos] = useState<Video[]>([]);
  const [clips, setClips] = useState<Clip[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [tab, setTab] = useState<Tab>("clips");
  const [tokens, setTokens] = useState<string[]>([]);

  useEffect(() => {
    Promise.all([fetchVideos(), fetchClips()])
      .then(([vs, cs]) => {
        setVideos(vs);
        setClips(cs);
        setStatus("ready");
      })
      .catch(() => setStatus("error"));
  }, []);

  const tagIndex = useMemo(() => buildTagIndex(clips), [clips]);

  if (status !== "ready") {
    return (
      <main className="cm-app">
        <div className="cm-empty">
          <div className="cm-empty__glyph">∿</div>
          <p>
            {status === "loading"
              ? "Loading the archive…"
              : "Couldn't reach the Clipmark server."}
          </p>
        </div>
      </main>
    );
  }

  return (
    <LibraryView
      tab={tab}
      onTab={setTab}
      tokens={tokens}
      onTokens={setTokens}
      tagIndex={tagIndex}
      videos={videos}
      clips={clips}
      onOpenClip={() => {}}
      onOpenVideo={() => {}}
    />
  );
}
