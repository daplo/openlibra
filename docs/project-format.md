# `.libra` project format

Open Libra project files use the `.libra` extension and the media type
`application/vnd.openlibra.project+json`.

Version 1 is a UTF-8 JSON envelope:

```json
{
  "format": "open-libra-project",
  "format_version": 1,
  "document": {
    "schema_version": 8,
    "active_page_id": "…",
    "pages": []
  }
}
```

`format_version` versions the outer project container. `document.schema_version`
independently versions the Rust-owned document model. Readers reject unknown
container versions and migrate supported legacy document schemas during load.

The first version keeps media sources in the structured document payload. A later
container version may add content-addressed binary entries without changing the
document schema. Open Libra also accepts legacy raw document JSON and `.olibra`
files for backward compatibility.

Local autosaves and recovery snapshots are browser-owned IndexedDB records. They
are not part of a downloaded `.libra` file.
