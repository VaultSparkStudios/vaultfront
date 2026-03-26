# Start Protocol

Use this when the user says only `start`.

## Read order

1. `AGENTS.md`
2. `context/PROJECT_BRIEF.md`
3. `context/SOUL.md`
4. `context/BRAIN.md`
5. `context/CURRENT_STATE.md`
6. `context/DECISIONS.md`
7. `context/TASK_BOARD.md`
8. `context/LATEST_HANDOFF.md`
9. only then task-specific files

## Startup rules

- treat repo files as source of truth, not prior chat memory
- do not edit code during startup unless the user explicitly asks for implementation immediately
- use `context/LATEST_HANDOFF.md` as the active handoff source
- treat legacy handoff docs as historical context only
- note assumptions clearly

## Required startup output

Reply with a concise `Startup Brief` containing:

1. project identity
2. current state
3. active priorities
4. important constraints
5. likely next best move
6. blockers or ambiguities
