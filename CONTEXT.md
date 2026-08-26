# Clipmark

A local, single-user tool for marking and tagging time ranges (clips) in dance videos so they can be searched and re-watched for practice.

## Language

**Video**:
A video file in the library, identified by a content hash of the file so it can be renamed or moved without breaking clips.
_Avoid_: File, clip source

**Clip**:
A saved time range on a video, with tags and an optional note. The core unit the user creates.
_Avoid_: Annotation, marker, bookmark

**Tag**:
A searchable label attached to a clip (e.g. a dancer's name, a move).
_Avoid_: Label, keyword, category

**Note**:
Free-form text attached to a clip.
_Avoid_: Comment, description

**Hash**:
The 16-character content hash (sha256 of the first 64KB of the file) that identifies a Video.
_Avoid_: ID, checksum

**Mark**:
The act of setting a clip's start (IN) or end (OUT) time at the current playback position.
_Avoid_: Set, flag

**Library Folder**:
The single directory the app scans for Videos. A Video is part of the library only while its file is under this folder; Clips on Videos outside it are kept but hidden.
_Avoid_: Video dir, root, source folder

**Download**:
An in-flight fetch of an online video into the Library Folder. It becomes a Video once the file has landed. Runs one at a time, in order; not persisted (ADR-0006).
_Avoid_: Job, fetch, import
