import { useEffect, useState } from "react";

export function App() {
  const [connected, setConnected] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/api/health")
      .then((res) => res.json())
      .then((body) => setConnected(body.ok === true))
      .catch(() => setConnected(false));
  }, []);

  return (
    <main className="app">
      <h1>Clipmark</h1>
      <p>
        {connected === null
          ? "Connecting to the server…"
          : connected
            ? "Connected to the server."
            : "Server unreachable."}
      </p>
    </main>
  );
}
