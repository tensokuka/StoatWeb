---
name: stoat-frontend-onboarding
description: Audit a Stoat frontend and establish verified developer documentation and AI coding standards.
argument-hint: Optional focus area or documentation constraints
agent: agent
---

# Goal

Understand this repository's existing frontend architecture and establish accurate human documentation and persistent AI-agent instructions.

## Phase 1: Audit — no edits

Inspect the repository systematically, including:
- Directory structure, entry points, routing, and application lifecycle.
- Framework, dependencies, build configuration, and package scripts.
- Components, layouts, styling, design tokens, and UI conventions.
- State management, API clients, authentication, events, and data flow.
- Types, utilities, error handling, testing, linting, and formatting.
- Existing documentation, configuration, and established patterns.

Prioritize representative files and trace important flows rather than exhaustively reading every file. Exclude generated files, dependencies, build artifacts, and unrelated vendored code.

Report:
1. A high-level architecture overview and directory map.
2. Key application flows and where common changes belong.
3. Observed coding, component, styling, and state-management conventions, with file references.
4. Available development, test, lint, type-check, and build commands.
5. Ambiguities, inconsistencies, legacy patterns, and knowledge gaps.
6. A proposed outline for `README.md` and `.github/copilot-instructions.md`.

Distinguish verified facts from inferences and recommendations. Do not invent conventions or silently treat inconsistencies as standards.

**Stop here. Make no file changes.** Present the findings for review and await approval before proceeding.

## Phase 2: Document — after approval

Create or update:

### `README.md`
Write a concise, human-oriented developer guide explaining:
- What the project is and how its major parts fit together.
- Directory structure and important entry points.
- Component, routing, state, API, and styling architecture.
- Where to implement common feature types and bug fixes.
- Setup, development, build, test, lint, and type-check workflows.
- Relevant conventions and links to useful source files.

Prioritize navigation and understanding over exhaustive inventories. Preserve useful existing content and avoid duplicating generated or external documentation.

### `.github/copilot-instructions.md`
Create concise, actionable, repository-wide rules for AI coding agents covering:
- Architecture and established implementation patterns.
- Component boundaries, reuse, naming, types, and file organization.
- Styling conventions, design tokens, and UI consistency.
- State, API, asynchronous operations, and error handling.
- Tests, validation commands, accessibility, and compatibility.
- Scope control and completion reporting.

Rules must be grounded in the audit. Prefer explicit MUST/MUST NOT requirements for important constraints. Instruct agents to inspect neighboring implementations, reuse existing abstractions, make the smallest coherent change, preserve established behavior, and avoid unnecessary dependencies, refactors, duplicate abstractions, and unrelated formatting changes.

Do not impose a new architecture or prescribe a convention merely because it is common elsewhere. Document conflicting existing patterns as exceptions or unresolved decisions.

If the repository warrants specialized instructions, propose path-specific files under `.github/instructions/`, but only create them when they add meaningful value beyond the global rules.

## Phase 3: Validate

Review both documents against the actual source and configuration.

- Verify paths, filenames, commands, and architectural claims.
- Remove unsupported claims, duplication, vague rules, and unnecessary detail.
- Ensure the README teaches a newcomer how to navigate and modify the frontend.
- Ensure agent instructions are concise, enforceable, and consistent with existing code.
- Check that no application code, dependencies, or unrelated files were changed.
- Run appropriate documentation checks where available.

Finish with a summary of files created or updated, validation performed, remaining uncertainties, and recommended follow-up work.

## Constraints

- Do not modify application code or configuration unrelated to documentation.
- Do not run destructive commands or make unrelated changes.
- Preserve existing project conventions unless an inconsistency is explicitly identified and approved for resolution.
- Keep documentation maintainable; prefer durable architectural guidance over transient implementation details.
- If context or time is insufficient, report what remains rather than claiming the audit is complete.

Optional focus: ${input:focus:None}