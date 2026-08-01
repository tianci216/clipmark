# SQLite instead of YAML for clip storage

Contrary to the default of keeping the existing `annotations.yaml`, storage moves to SQLite. The user prefers a real database as the persistent store for the rewritten app. This gives structured queries (search becomes SQL, not an in-memory scan) and a single-file store. Existing YAML data is migrated via a standalone one-time import script (e.g. `npm run migrate`), deliberately NOT wired into production startup — migration is an explicit developer action, and `annotations.yaml` is left in place as a safety net.
