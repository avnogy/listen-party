# listen-party

`listen-party` is a small LAN music server for office / LAN-party environments.
It serves one embedded browser UI, indexes local MP3 files, and lets connected
browsers share one queue and playback state.

The project is intentionally simple:

- Go single binary.
- Static embedded HTML/CSS/JS.
- SQLite for the local MP3 index.
- Basic Auth for the current POC.
- No internet services at runtime.

## Current State

Working:

- Recursive MP3 indexing from configured folders.
- Automatic first-run config creation.
- SQLite-backed metadata/search cache.
- Browser UI embedded in the binary.
- Shared queue.
- Add, remove, and clear queued tracks.
- Skip current track.
- Track-end auto advance.
- Search-as-you-type with recent tracks as the empty search view.
- Library track count.
- SSE state updates and periodic state heartbeat.

Known limitation:

- Playback synchronization between tabs is not yet reliable enough. Queue state
  and current track state propagate, but browser media element play/pause state
  can still desynchronize, especially around starting the first track in another
  tab. This needs a deliberate redesign of the playback-control model.

Volume and mute are intentionally browser-local.

## Config

Runtime config is JSON at:

```text
${UserConfigDir}/listen-party/config.json
```

The default SQLite database path is:

```text
${UserConfigDir}/listen-party/listen-party.sqlite
```

If the config file does not exist, the server creates it with these defaults:

```json
{
  "addr": "0.0.0.0:8080",
  "music_dirs": ["${UserConfigDir}/listen-party/music"],
  "database_path": "${UserConfigDir}/listen-party/listen-party.sqlite",
  "auth": {
    "listener": {"username": "default", "password": "default"},
    "admin": {"username": "admin", "password": "admin"},
    "rescan": {"username": "default", "password": "default"}
  }
}
```

Any configured `music_dirs` path that does not exist is created as an empty
directory at startup.

The server prints the resolved config directory at startup.

## Build And Run

Run from the repo root:

```sh
go run .
```

Build:

```sh
go build -o build/lp .
```

Run a built binary:

```sh
./build/lp
```

Use a custom config path:

```sh
./build/lp -config ./config.json
```

Open:

```text
http://localhost:8080
```

Default listener login:

```text
default / default
```

Default admin login:

```text
admin / admin
```

## Development Notes

Useful checks:

```sh
go test ./...
go build -o build/lp .
```

If port `8080` is stuck during local development:

```sh
fuser -k 8080/tcp
```

## Future Work

Highest priority:

- Redesign playback synchronization so the server is the durable source of
  truth and all tabs converge consistently on track, play/pause, and time.
- Decide whether to keep native `<audio controls>` or replace it with explicit
  app-owned controls. Native controls are convenient, but they make full shared
  control harder to reason about.
- Add focused browser-level/manual test cases for two-tab synchronization.

Next:

- Editable admin page for config and library management.
- Separate admin-only auth surface for administration.
- Scan stats: last scan time, indexed count, added/removed/skipped files.
- Better queue management: reorder and move-to-next.
- Future room model: dynamic rooms with join secrets.
- OAuth-capable auth abstraction for later deployment.
