# NETSENTRY Console

Frontend for the [netsentry](https://github.com/joshua-olivier-codes/netsentry)
intrusion detection engine. Runs as a web app or a desktop app from the same
React codebase.

## Run it

```bash
pnpm install
pnpm dev            # web, on http://localhost:5173
pnpm desktop        # desktop window (needs pnpm dev running)
```

Point it at the engine with the field in the top bar. Default is
`http://127.0.0.1:8086`.

## No engine yet?

The trained `.joblib` models aren't in the engine repo, so there's a stub that
speaks the same four endpoints:

```bash
python tools/stub_engine.py
python tools/make_sample_csv.py     # writes samples/sample_flows.csv
```

Then drop that CSV into the console and hit Start replay.

## How it works

The engine is stateless and classifies one flow per request. There's no alert
stream and no history, so this app keeps its own: it reads a CICIDS2017 CSV,
feeds rows to `POST /api/predict` at a rate you control, and builds the
dashboard from the responses.

- `src/api/` — the four endpoints, the 70-feature schema, transport
- `src/engine/` — CSV parsing and the replay transport
- `src/store/` — session history and aggregates
- `electron/` — desktop shell

## Known issue

The engine has `flask-cors` installed but never calls `CORS(app)`, so browsers
can't reach it cross-origin. Workarounds in place:

- **Desktop** — requests go through Electron's main process, so CORS never applies.
- **Web dev** — `pnpm dev` proxies `/engine` to the API, making it same-origin.

Adding `CORS(app)` to the Flask service removes the need for both.

## Package

```bash
pnpm desktop:build   # installer into release/
```
