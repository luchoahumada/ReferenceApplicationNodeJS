# Node.js Support Notes

## Where this project comes from

This repository is the official **HbbTV Reference Application** from:

- HbbTV Association  
- Repository: https://github.com/HbbTV-Association/ReferenceApplication

The original implementation is PHP-based and remains intact in this repo.

## Why Node.js was added

A Node.js server was added as an **additional runtime option** for local development and integration testing.

Important:

- PHP files are still present and unchanged in the repository.
- Existing PHP flow remains the baseline behavior.
- Node.js support is additive, not a replacement of the original PHP app.

## Current coexistence model

- **PHP mode (original):** use existing PHP entry points (`.php`) and original project structure.
- **Node mode (optional):** use the Node server under `server/` with `package.json`.

Both live in the same repository so teams can compare or choose runtime based on environment needs.

## Node quick start

```bash
npm install
npm start
```

Default server URL:

- `http://127.0.0.1:8000`

## Notes

- This file documents runtime coexistence only.
- Functional and operational details for Node endpoints are in:
  - `doc/nodejs_migration.md`
