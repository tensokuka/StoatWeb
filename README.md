<div align="center">
<h1>
  Stoat Frontend
  
  [![Stars](https://img.shields.io/github/stars/stoatchat/for-web?style=flat-square&logoColor=white)](https://github.com/stoatchat/for-web/stargazers)
  [![Forks](https://img.shields.io/github/forks/stoatchat/for-web?style=flat-square&logoColor=white)](https://github.com/stoatchat/for-web/network/members)
  [![Pull Requests](https://img.shields.io/github/issues-pr/stoatchat/for-web?style=flat-square&logoColor=white)](https://github.com/stoatchat/for-web/pulls)
  [![Issues](https://img.shields.io/github/issues/stoatchat/for-web?style=flat-square&logoColor=white)](https://github.com/stoatchat/for-web/issues)
  [![Contributors](https://img.shields.io/github/contributors/stoatchat/for-web?style=flat-square&logoColor=white)](https://github.com/stoatchat/for-web/graphs/contributors)
  [![License](https://img.shields.io/github/license/stoatchat/for-web?style=flat-square&logoColor=white)](https://github.com/stoatchat/for-web/blob/main/LICENSE)
</h1>
The official web client powering https://stoat.chat/app, built with <a href="https://www.solidjs.com/">Solid.js</a> 💖. <br/>
Track the project roadmap on <a href="https://op.stoatinternal.com/projects/revolt-for-web/roadmap">OpenProject</a>.
</div>
<br/>

## Overview

This repository is a pnpm workspace driven by [mise](https://mise.jdx.dev/) tasks (see `.mise/tasks/`).

| Package                             | Purpose                                            |
| ----------------------------------- | -------------------------------------------------- |
| `packages/client`                   | The web app (Solid.js, Vite, Panda CSS, Lingui)    |
| `packages/stoat.js`                 | API/WebSocket SDK, a git submodule built to `lib/` |
| `packages/solid-livekit-components` | LiveKit voice/video components, a git submodule    |

`packages/client/assets` is an optional private brand-assets submodule; fallbacks are used when it is absent.

### Repository map (`packages/client`)

| Path                                                   | What lives here                                                                                  |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| [src/index.tsx](packages/client/src/index.tsx)         | Entry point: context providers and all routes                                                    |
| [src/Interface.tsx](packages/client/src/Interface.tsx) | Logged-in layout (sidebar + content), redirects to `/login` when logged out                      |
| `src/interface/`                                       | Route-level pages (Home, Friends, Discover, ServerHome, channels, sidebar navigation)            |
| `components/*`                                         | Internal packages imported as `@revolt/<name>` (aliases in `vite.config.ts` and `tsconfig.json`) |
| `components/client`                                    | `ClientController` and session lifecycle state machine; `useClient`, `useUser`                   |
| `components/state`                                     | Global `State` and persisted stores (`useState()`)                                               |
| `components/modal`                                     | Modal types, renderer, and `modals/*`                                                            |
| `components/ui`                                        | Design system, themes, directives                                                                |
| `components/app`                                       | Larger feature UI: settings, context menus, text channel components                              |
| `components/auth`                                      | Login and account flows                                                                          |
| `components/i18n`                                      | Languages, dayjs, error translation, Lingui catalogs                                             |
| `components/instance`                                  | Multi-instance support (`/i/:host`)                                                              |
| `components/routing`                                   | Re-export of `@solidjs/router` and `useSmartParams`                                              |
| `components/common`                                    | Device/breakpoint helpers and `lib/env.ts` (`VITE_*` configuration)                              |
| `components/markdown`, `rtc`, `keybinds`               | Markdown rendering, voice/video, keybinds                                                        |

### How the app starts

`src/index.tsx` renders `DeviceContext`, `I18nProvider`, `SnackbarProvider` and the router. Every route tree is wrapped in `InstanceContext` and then `MountContext`, which nests state, keybind, modal, client, sound and voice contexts plus the TanStack Query client. `ClientController` runs the session state machine described in [Session Lifecycle](doc/src/components/client/session-lifecycle.md).

### Where to make changes

| Change                         | Where                                                                                                                                                |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| New page or route              | Add a `Route` in `src/index.tsx`; put the page in `src/interface/`                                                                                   |
| New modal                      | Add a variant to `components/modal/types.ts`, a file in `modals/`, and a case in `modals.tsx` ([guidelines](doc/src/components/modal/guidelines.md)) |
| New persisted setting or state | New store in `components/state/stores/` ([guide](doc/src/components/state/creating.md))                                                              |
| Reusable UI                    | `components/ui/components/`                                                                                                                          |
| User-facing strings            | Lingui macros ([guide](doc/src/components/i18n/using-lingui.md))                                                                                     |
| Responsive behaviour           | [Device](doc/src/responsive/device.md)                                                                                                               |
| Backend calls                  | Through `stoat.js` objects from `useClient()`                                                                                                        |

Styling uses Panda CSS (`styled-system/` is generated by `pnpm prepare` and gitignored) with Material design tokens exposed as CSS variables (generated in `components/ui/themes/stoatWebTheme.ts`).

For code style and accessibility rules read [GUIDELINES.md](GUIDELINES.md). Technical docs live in [doc/](doc/src/SUMMARY.md) and are published at https://stoatchat.github.io/for-web/. AI agent rules are in [.github/copilot-instructions.md](.github/copilot-instructions.md).

## Development Guide

Before contributing, make yourself familiar with [our contribution guidelines](https://developers.stoat.chat/developing/contrib/), the [code style guidelines](./GUIDELINES.md), and the [technical documentation for this project](https://stoatchat.github.io/for-web/).

Before getting started, you'll want to install:

- [Git](https://git-scm.com/install/)
- [mise-en-place](https://mise.jdx.dev/getting-started.html)

Then proceed to setup:

```bash
# clone the repository
git clone --recursive https://github.com/stoatchat/for-web client
cd client

# update submodules if you pull new changes
# git submodule init && git submodule update

# install all packages
mise install:frozen

# build deps:
mise build:deps

# or build a specific dep (e.g. stoat.js updates):
# pnpm --filter stoat.js run build

# customise the .env
cp packages/client/.env.example packages/client/.env

# run dev server
mise dev

# run all CI checks locally (install, build, lint, type-check, format, unit and e2e tests)
mise check
```

Individual checks:

```bash
mise build:check   # type-check
mise lint          # eslint (lint:fix to fix)
mise format        # prettier (format:fix to fix)
mise test:unit     # vitest
mise test:e2e      # playwright (run mise test:e2e:install-deps first)
```

`mise build:deps` also compiles the Lingui catalogs, which are required before the app will build.

Finally, navigate to http://local.revolt.chat:5173.

### Using the official backend

By default, the client connects to a backend running on the same host (localhost).

If you want the client to connect to the official hosted backend instead, open the .env file at /packages/client/.env and comment out the local URL varaibles like this:

```env
# connect to local Stoat instance
#VITE_API_URL=http://localhost:14702
```

When these variables are not set, the client automatically falls back to the official backend. (See https://github.com/stoatchat/for-web/blob/main/packages/client/components/common/lib/env.ts)

## Deployment Guide

### Build the app

```bash
# install packages
mise install:frozen

# build dependencies
mise build:deps

# build for web
mise build

# ... when building for Stoat production
mise build:prod
```

You can now deploy the directory `packages/client/dist`.

### Routing Information

The app currently needs the following routes:

- `/login`
- `/pwa`
- `/dev`
- `/discover`
- `/settings`
- `/invite`
- `/bot`
- `/friends`
- `/server`
- `/channel`

All of the above are also served under the `/i/:host` prefix for alternate instances.

This corresponds to `routes()` in [src/index.tsx](packages/client/src/index.tsx).
