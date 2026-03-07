# VaultFront

VaultFront is a browser RTS focused on territorial control, convoy routing, objective timing, and tactical comeback windows.

## Project Origin

VaultFront is a derived work built from [OpenFrontIO](https://github.com/openfrontio/OpenFrontIO), which itself evolved from WarFront.io.

This repository preserves the upstream licensing trail and credits:

- Source code remains under [AGPL-3.0](LICENSE)
- Open asset licensing remains documented in [LICENSE-ASSETS](LICENSE-ASSETS)
- Licensing history and proprietary carve-outs remain documented in [LICENSING.md](LICENSING.md)

When redistributing or hosting modified versions, preserve the visible copyright notices required by the upstream license history.

## Launch Notes

- GitHub repository: `https://github.com/VaultSparkStudios/VaultFront`
- Current branding and gameplay direction are specific to the VaultFront fork
- Upstream OpenFrontIO and original contributors remain credited in this repo

## Features

- Real-time territory expansion and tactical combat
- VaultFront objective layer with convoy routing and timed rewards
- Solo and multiplayer modes
- Browser-based client/server development workflow
- Shared TypeScript game core across client and server

## Prerequisites

- [npm](https://www.npmjs.com/) 10+
- A modern browser

## Installation

```bash
git clone https://github.com/VaultSparkStudios/VaultFront.git
cd VaultFront
npm run inst
```

Use `npm run inst` for an exact `package-lock.json` install. Do not default to `npm install` unless dependencies changed intentionally.

## Development

Run client and server together:

```bash
npm run dev
```

Useful commands:

```bash
npm run start:client
npm run start:server-dev
npm run lint
npm run format
npm test
```

## Project Structure

- `src/client` - frontend client and HUD/UI layers
- `src/core` - shared rules, simulation, schemas, and gameplay systems
- `src/server` - backend game server and APIs
- `resources` - static assets, localization, legal pages, and metadata
- `tests` - automated gameplay and UI regression coverage

## Attribution

- OpenFrontIO contributors: see [CREDITS.md](CREDITS.md)
- WarFront.io lineage acknowledged via upstream project history
- Additional asset and map-data attribution remains in [CREDITS.md](CREDITS.md)
