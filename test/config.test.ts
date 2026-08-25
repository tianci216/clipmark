import path from "node:path";
import { describe, expect, it } from "vitest";
import { findDataDir, findRepoRoot } from "../server/src/config";

describe("data directory", () => {
  it("defaults to <repo>/data", () => {
    expect(findDataDir({})).toBe(path.join(findRepoRoot(), "data"));
  });

  it("honours CLIPMARK_DATA_DIR", () => {
    expect(findDataDir({ CLIPMARK_DATA_DIR: "/tmp/clipmark-data" })).toBe("/tmp/clipmark-data");
  });
});
