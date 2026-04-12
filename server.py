import argparse
import hashlib
import os
from pathlib import Path

import yaml
from flask import Flask, Response, jsonify, render_template, request

app = Flask(__name__)
ANNOTATIONS_FILE = Path(__file__).parent / "annotations.yaml"
VIDEO_EXTENSIONS = {".mp4", ".mov"}
HASH_BYTES = 65536  # first 64KB for content hashing


def compute_file_hash(filepath):
    h = hashlib.sha256()
    with open(filepath, "rb") as f:
        h.update(f.read(HASH_BYTES))
    return h.hexdigest()[:16]


def parse_args():
    parser = argparse.ArgumentParser(description="Clipmark - dance video bookmark tool")
    parser.add_argument(
        "video_dir",
        nargs="?",
        default="/Users/tianci/Documents/Swing & Jazz",
    )
    return parser.parse_args()


def build_tree(video_dir):
    tree = {"name": video_dir.name, "path": "", "children": [], "videos": []}
    nodes = {"": tree}

    for dirpath, dirnames, filenames in os.walk(video_dir):
        rel = os.path.relpath(dirpath, video_dir)
        if rel == ".":
            rel = ""
        node = nodes.get(rel, tree)
        dirnames.sort()
        for d in dirnames:
            child_rel = os.path.join(rel, d) if rel else d
            child = {"name": d, "path": child_rel, "children": [], "videos": []}
            node["children"].append(child)
            nodes[child_rel] = child
        videos = sorted(
            f for f in filenames if Path(f).suffix.lower() in VIDEO_EXTENSIONS
        )
        for v in videos:
            vpath = os.path.join(rel, v) if rel else v
            full = os.path.join(video_dir, vpath)
            vhash = compute_file_hash(full)
            node["videos"].append({"name": v, "path": vpath, "hash": vhash})

    return tree


def load_annotations():
    if ANNOTATIONS_FILE.exists():
        with open(ANNOTATIONS_FILE) as f:
            data = yaml.safe_load(f)
            return data if data else {"videos": []}
    return {"videos": []}


def save_annotations(data):
    with open(ANNOTATIONS_FILE, "w") as f:
        yaml.dump(data, f, allow_unicode=True, default_flow_style=False, sort_keys=False)


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/tree")
def api_tree():
    return jsonify(build_tree(VIDEO_DIR))


@app.route("/video/<path:filepath>")
def serve_video(filepath):
    full_path = (VIDEO_DIR / filepath).resolve()
    if not full_path.exists() or not full_path.is_file():
        return "Not found", 404
    if not str(full_path).startswith(str(VIDEO_DIR)):
        return "Forbidden", 403

    file_size = full_path.stat().st_size
    mime = "video/mp4"

    range_header = request.headers.get("Range")
    if range_header:
        byte_range = range_header.replace("bytes=", "").split("-")
        start = int(byte_range[0])
        end = int(byte_range[1]) if byte_range[1] else min(start + 1024 * 1024 - 1, file_size - 1)
        length = end - start + 1

        def generate():
            with open(full_path, "rb") as f:
                f.seek(start)
                remaining = length
                while remaining > 0:
                    chunk = f.read(min(8192, remaining))
                    if not chunk:
                        break
                    remaining -= len(chunk)
                    yield chunk

        return Response(
            generate(),
            206,
            {
                "Content-Type": mime,
                "Content-Range": f"bytes {start}-{end}/{file_size}",
                "Accept-Ranges": "bytes",
                "Content-Length": length,
            },
        )

    def generate_full():
        with open(full_path, "rb") as f:
            while True:
                chunk = f.read(8192)
                if not chunk:
                    break
                yield chunk

    return Response(
        generate_full(),
        200,
        {
            "Content-Type": mime,
            "Accept-Ranges": "bytes",
            "Content-Length": file_size,
        },
    )


@app.route("/api/annotations", methods=["GET"])
def get_annotations():
    return jsonify(load_annotations())


@app.route("/api/annotations", methods=["POST"])
def post_annotation():
    body = request.json
    video_hash = body["hash"]
    file_path = body.get("file", "")
    clip = body["clip"]

    data = load_annotations()
    video_entry = None
    for v in data["videos"]:
        if v["hash"] == video_hash:
            video_entry = v
            break
    if not video_entry:
        video_entry = {"hash": video_hash, "file": file_path, "clips": []}
        data["videos"].append(video_entry)
    else:
        video_entry["file"] = file_path

    video_entry["clips"].append(clip)
    save_annotations(data)
    return jsonify({"ok": True})


@app.route("/api/annotations", methods=["DELETE"])
def delete_annotation():
    body = request.json
    video_hash = body["hash"]
    clip_index = body["clip_index"]

    data = load_annotations()
    for v in data["videos"]:
        if v["hash"] == video_hash:
            if 0 <= clip_index < len(v["clips"]):
                v["clips"].pop(clip_index)
            if not v["clips"]:
                data["videos"].remove(v)
            break
    save_annotations(data)
    return jsonify({"ok": True})


@app.route("/api/search")
def search_clips():
    tag = request.args.get("tag", "").lower().strip()
    if not tag:
        return jsonify([])

    data = load_annotations()
    results = []
    for v in data["videos"]:
        for i, clip in enumerate(v.get("clips", [])):
            if any(tag in t.lower() for t in clip.get("tags", [])):
                results.append({"hash": v["hash"], "file": v.get("file", ""), "clip": clip, "clip_index": i})
    return jsonify(results)


if __name__ == "__main__":
    args = parse_args()
    VIDEO_DIR = Path(args.video_dir).resolve()
    print(f"Serving videos from: {VIDEO_DIR}")
    app.run(host="0.0.0.0", port=8899)
