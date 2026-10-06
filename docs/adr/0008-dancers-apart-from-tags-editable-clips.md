# Dancers apart from Tags, lowercase Tags, editable Clips

Tags were doing two jobs: naming the people in a Clip ("Dax Hock") and describing the dancing ("swing out"). The live data showed it — of 87 distinct tags, 77 remained once case was ignored, and most were Title Case names. We decided to **split the concepts**: a **Dancer** is a person named on a Clip, stored in its own `clip_dancers(clip_id, name)` relation with capitalisation kept as typed and deduplicated case-insensitively; a **Tag** describes the dancing and is **always lowercase**, normalised by the server on every write (trim, collapse whitespace, lowercase) so autocomplete and search never see "Alice" beside "alice". Existing rows migrate once: a reviewed list of name-tags moves to Dancers on their Clips, everything else is lowercased and case-duplicates merge. Punctuation is not folded — "swing-out" and "swing out" stay distinct.

ADR-0004 said Clips are create/delete only. That is reversed: **every part of a Clip is editable in place** (IN/OUT, Dancers, Tags, Note) through an update route, with the same `end > start` rule. Re-marking a clip from scratch was the workaround, and it loses the Clip's id and rail position for no benefit.

Searching and the related-clips rail treat Dancers and Tags the same way (substring, case-insensitive, one search box), but they are never merged into one list: a name is not a tag.

Rejected: lowercasing names along with tags (a name's capitalisation is part of it); a `kind` column on `clip_tags` instead of a second table (the two have different canonical forms and would need the discriminator in every query); auto Title Case for dancers (breaks names such as "deVries").
