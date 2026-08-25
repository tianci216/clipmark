import { useEffect, useState } from "react";

/** True while the CSS media query matches; tracks changes (resize, rotation). */
export function useMedia(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setMatches(mq.matches);
    mq.addEventListener("change", onChange);
    setMatches(mq.matches);
    return () => mq.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}

/** The phone layout breakpoint shared by the shell and the stylesheet. */
export const PHONE_QUERY = "(max-width: 860px)";
