# ClipMark
This app exists to fulfill a very simple purpose: clipping videos with tags, and searching clips by tags. You see, I'm a Lindy Hopper and I've collected hundreds of dance videos that fascinate me. Sometimes when I see a really cool move that I want to save for later practice (or never practice), I have to manually trim the video and save it as a new file. This not only wastes disk space, but searching for the clips I want is like looking for a needle in a haystack.

So I created ClipMark to do exactly this, clipping and tagging dance videos for practice. I tried to keep ClipMark as minimalist as possible — it should serve one purpose and serve it well. The idea behind it is simple: a yaml file keeps track of file hashes, start & end times, tags and notes; a simple Flask server that edits that yaml file; and an HTML page that serves as a web frontend.

With ClipMark you can create clips by marking start and end times, and you can add tags and a note to each one. You can search clips by tag (e.g. swing out). Clips loop until you click on the timeline. You can move and rename files freely as each file is tracked by hash, not a hardcoded path.

## Demo
[![ClipMark Demo](https://img.youtube.com/vi/SvEPgWu__PM/maxresdefault.jpg)](https://youtu.be/SvEPgWu__PM)

## Installation

1. Make sure you have Python 3 installed.

2. Clone this repo:
   ```bash
   git clone https://github.com/your-username/clipmark.git
   cd clipmark
   ```

3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

## Usage

Run the server, passing your video directory as an argument:

```bash
python server.py /path/to/your/videos
```

Then open http://127.0.0.1:8899 in your browser.

If no directory is provided, it defaults to `~/Documents/Swing & Jazz`.

## Quick Use

What I do to open ClipMark quickly is to add a custom function to my terminal profile. Add this to your `~/.bashrc` or `~/.zshrc`:

```bash
clipmark() {
    python /path/to/clipmark/server.py "$@" &
    open "http://127.0.0.1:8899"
}
```

Replace `/path/to/clipmark` with the actual path where you cloned the repo. Then reload your profile:

```bash
source ~/.zshrc   # or source ~/.bashrc
```

Now you can launch ClipMark from anywhere:

```bash
clipmark                        # uses default video directory
clipmark ~/Videos/Dance         # specify a different directory
```

## How It Works

- Browse your video folder tree in the sidebar
- Play any `.mp4` or `.mov` video
- Mark a start and end time to create a clip
- Add tags and notes to each clip
- Search across all clips by tag

All clip data is saved locally in `annotations.yaml` (gitignored). Videos are tracked by a content hash, so renaming or moving files won't break your clips.
