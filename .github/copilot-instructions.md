# Stoat for Web: agent instructions

Solid.js web client in a pnpm workspace. App code is in `packages/client`; `packages/stoat.js` and `packages/solid-livekit-components` are git submodules. Read [README.md](../README.md) for the repository map and [GUIDELINES.md](../GUIDELINES.md) for code style and accessibility rules (MUST follow both). Technical docs are in `doc/src/` and are linked below.

## Scope

- Make the smallest coherent change. Inspect neighbouring files first and reuse existing abstractions.
- MUST NOT add dependencies, refactor unrelated code, or reformat unrelated lines.
- MUST NOT edit generated or vendored output: `packages/client/styled-system/`, `components/i18n/catalogs/**/messages.ts`, `dist/`, `packages/stoat.js/lib/`.
- MUST NOT modify `packages/stoat.js` or `packages/solid-livekit-components` unless the task is explicitly about them.
- Preserve existing behaviour. When existing patterns conflict, follow the closest neighbour and say so in your report instead of choosing a new standard.

## Structure and imports

- Internal packages live in `packages/client/components/<name>` and are imported as `@revolt/<name>`. MUST use these aliases for cross-package imports.
- MUST re-export a third-party library from one package if it is used in several (for example `@revolt/routing` re-exports `@solidjs/router`). Import router APIs from `@revolt/routing`.
- Routes and providers are defined only in `packages/client/src/index.tsx`; route-level pages go in `src/interface/`.

## Components

- MUST NOT destructure Solid props. Use `splitProps` / `mergeProps` ([GUIDELINES.md](../GUIDELINES.md)).
- Put a JSDoc comment above new components, functions and constants.
- Reuse components from `@revolt/ui` before creating new ones. Generic UI goes in `components/ui/components/`; feature UI in `components/app` or `src/interface`.
- Do not add reactive reads outside tracking scopes. If a `solid/reactivity` eslint suppression is truly required, justify it in a one-line comment.

## Styling

- Use Panda CSS: `styled(...)` from `styled-system/jsx`, `css`/`cva` from `styled-system/css`. Follow the style used in the file you are editing.
- Use design tokens as CSS variables (`--md-sys-color-*`, `--gap-*`, `--borderRadius-*`; defined in `components/ui/themes/stoatWebTheme.ts`) instead of hard-coded colours, spacing and radii.
- Use Panda conditions `_tablet` / `_phone` for CSS-only responsiveness, and `useDevice()` from `@revolt/common` when logic depends on layout ([doc](../doc/src/responsive/device.md)). MUST NOT infer touch or phone from screen size.
- After changing Panda usage or config, run `pnpm --filter client exec panda codegen` (also run by `pnpm prepare`).

## State, API and async

- Read persisted state through `useState()` from `@revolt/state`. New stores follow [Creating a New State Store](../doc/src/components/state/creating.md): the store type, `SYNCED_KEYS` if synced, and the `State` class in `components/state/index.tsx`.
- Use `useClient()` / `useUser()` from `@revolt/client` for the active client. MUST NOT destructure `useInstance()` results (not reactive).
- Backend access goes through `stoat.js` objects. Do not add ad-hoc `fetch` calls to the API.
- Translate API errors with `TranslatedError` or `useError()` from `@revolt/i18n` ([doc](../doc/src/components/i18n/translating-errors.md)).

## Modals

Follow [modal guidelines](../doc/src/components/modal/guidelines.md):

- Add the variant to `components/modal/types.ts`, the component to `modals/`, and the case to `modals.tsx`.
- Use the `Dialog` component. Use `Form2` for user input or TanStack `useMutation` for actions, not both. For mutations use `mutateAsync` and `onError: showError` from `useModals()`.

## i18n

- Wrap all user-facing strings with Lingui macros (`Trans`, `Plural`, `useLingui().t`) from `@lingui/solid/macro` ([doc](../doc/src/components/i18n/using-lingui.md)).
- MUST NOT run `mise lingui` or commit catalog changes; maintainers regenerate catalogs.

## Accessibility

- Use semantic HTML, aria labels where needed, and keyboard-operable controls ([GUIDELINES.md](../GUIDELINES.md)).

## Validation

Run what is relevant before reporting completion (all are mise tasks):

- `mise build:check` (type-check), `mise lint`, `mise format` (use `lint:fix` / `format:fix` to fix; prettier covers `packages/client/**/*.{ts,tsx,json}` only).
- `mise test:unit` (Vitest; only `**/*.test.ts` files are collected). `mise test:e2e` only when routes or the login page change.
- A build needs compiled Lingui catalogs and built submodules: run `mise build:deps` after pulling or on a fresh checkout.

When done, report what changed, which checks ran and their results, and anything not verified.

## Unresolved decisions (do not extend, do not "fix" opportunistically)

These coexist today with no agreed standard. Do not introduce new instances; leave existing ones alone unless asked.

- `components/ui/components/features/legacy/`, `themes/legacyStyled.d.ts` and `themes/legacyThemeGeneratorCode.ts`: legacy UI and theming. MUST NOT build new features on them.
- Deep imports such as `@revolt/auth/src/flows/*`, `@revolt/client/Controller`, and relative cross-package paths like `../components/ui/...` (in `src/Interface.tsx`). Prefer the package root export when one exists.
- Mixed styling approaches (`styled`, `css`, `cva`, inline `style={{}}`): match the file; do not migrate between them.
- Modal actions that use `try/catch` or `alert(...)` instead of the documented patterns above: do not copy them.
- `NOTES` at the repo root is a stale to-do list, not a source of conventions.
