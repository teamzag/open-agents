Summary: Replace the workflow-hosted Open Harness agent with a sandbox-resident agent host that embeds external coding-agent runtimes. Make the agent runtime a chat-level choice (`opencode`, `claude`, `codex`), keep sandbox/session orchestration in the web app, and use Next API routes only as authenticated proxy + persistence layers.

Context: Key findings from exploration -- existing patterns, relevant files, constraints

- Current chat execution is split across `apps/web/app/api/chat/route.ts`, `apps/web/app/workflows/chat.ts`, and `apps/web/app/workflows/chat-post-finish.ts`. The agent loop runs in Vercel functions/workflows, while each tool call reconnects back into the sandbox through `@open-harness/sandbox`.
- The web UI is tightly coupled to the custom AI SDK agent:
  - `apps/web/app/config.ts` hardcodes `webAgent = openHarnessAgent`
  - `apps/web/app/types.ts` derives all chat message/tool types from that agent
  - `apps/web/app/sessions/[sessionId]/chats/[chatId]/hooks/use-session-chat-runtime.ts` uses `@ai-sdk/react` `useChat`
  - `apps/web/app/sessions/[sessionId]/chats/[chatId]/session-chat-content.tsx` renders AI SDK tool parts directly
- Session and sandbox ownership boundaries are already useful and should stay:
  - sandbox lifecycle lives on `sessions.sandboxState`
  - conversation threads live in `chats`
  - persisted message history already lives in `chat_messages`
- Sandbox process-management prior art already exists in `apps/web/app/api/sessions/[sessionId]/dev-server/route.ts`. The sandbox abstraction supports detached background commands via `execDetached`, which is the right seam for a long-running host process inside the sandbox.
- Current defaults/preferences already thread model selection through chat creation:
  - `apps/web/lib/db/schema.ts`
  - `apps/web/lib/db/user-preferences.ts`
  - `apps/web/app/api/sessions/[sessionId]/chats/route.ts`
  - `apps/web/app/[username]/[repo]/page.tsx`
  This same path is the natural place to introduce a default agent runtime.
- SDK research:
  - OpenCode is the best first target because it already has a headless server/client model, sessions, agent switching, permissions, config files, and SSE/event APIs.
  - Claude Agent SDK is the next best fit because it already supports built-in coding tools, `canUseTool` for approvals/questions, session persistence, `resume`, and filesystem settings via `settingSources: ["project"]`.
  - Codex SDK is the thinnest surface: it has durable threads and `runStreamed()` events, but it looks more like a CLI wrapper than a complete multi-user server, so the adapter layer will need to do more work.
- Important constraint: these runtimes want local filesystem/process access, so they should be treated as first-class sandbox workloads. Do not wrap them inside the existing `ToolLoopAgent` abstraction.

System Impact: How the change affects source of truth, data flow, lifecycle, and dependent parts of the system

- What is changing:
  - The agent execution layer moves from Vercel workflows + `packages/agent` to a sandbox-local host process.
  - The web app becomes a control plane: auth, session ownership, persistence, proxy streaming, runtime selection, and sandbox lifecycle.
- Source of truth before:
  - in-progress execution: Vercel workflow run IDs in `chats.activeStreamId`
  - conversation state: AI SDK messages derived from `webAgent`
  - tool execution: custom tools reconnecting into the sandbox
- Source of truth after:
  - in-progress execution: sandbox-local host run state
  - persisted conversation state: web DB (`chats`, `chat_messages`) using a provider-neutral message/event schema
  - provider continuation state: chat-level runtime state (`agentRuntime` + provider session/thread metadata)
- New invariants:
  - A chat is bound to exactly one runtime after its first provider session is created.
  - Switching runtimes happens by creating a new chat (or empty chat) in the same repo/session, not by hot-swapping a live provider thread.
  - The sandbox host is idempotently bootstrapped per sandbox/session and protected by a deterministic session-scoped auth token.
  - The web app never runs the coding-agent loop itself; it only proxies and persists.
- Dependent flows that must move with this decision:
  - stop/reconnect streaming
  - approval/question handling
  - usage capture
  - auto-commit / auto-PR post-run hooks
  - chat hydration and refresh APIs
  - user preferences and session starter defaults
- Adjacent simplifications unlocked by this design:
  - `packages/agent` stops being the core runtime path
  - `apps/web/app/workflows/chat.ts` and `apps/web/app/config.ts` can leave the chat critical path
  - custom subagent/tool typing can be replaced with a runtime-neutral protocol instead of forcing all providers through AI SDK UI message types

Approach: High-level design decision and why

- Build a new workspace package, `packages/agent-host`, that runs inside the sandbox as a long-lived HTTP/SSE service.
- Give that host a provider adapter interface with three implementations:
  - `opencode` (first/default)
  - `claude`
  - `codex`
- Expose one normalized Open Harness protocol from the host: start/resume conversation, stream events, answer approval/question requests, abort runs, and list runtime metadata.
- Keep the host stateless with respect to durable conversation history whenever possible:
  - OpenCode sessions persist in OpenCode’s own local storage
  - Claude sessions persist in `~/.claude/...`
  - Codex threads persist in `~/.codex/sessions`
  - the web DB stores only the chat/runtime mapping, live run pointer, pending user-input state, and rendered message history
- Use OpenCode as the first runtime because it already matches the desired shape (server, sessions, agents, config, events). Land Claude next, then Codex after the common host/proxy protocol is proven.
- Keep runtime choice on `chats`, not `sessions`, so users can try Claude/OpenCode/Codex against the same sandbox by opening separate chats.
- Do not try to preserve the existing AI SDK-derived `WebAgentUIMessage` format. Introduce a provider-neutral message/event schema for the new platform and migrate the chat UI to it directly.

Changes:
- `package.json` - add the new workspace package and wire new runtime SDK dependencies through the workspace.
- `packages/agent-host/package.json` - new package for the sandbox-local host runtime.
- `packages/agent-host/index.ts` - export the host bootstrap and shared protocol types.
- `packages/agent-host/protocol.ts` - define the normalized runtime IDs, chat message/event schema, approval/question payloads, and run state contract shared by host + web app.
- `packages/agent-host/server.ts` - implement the in-sandbox HTTP/SSE host process and run registry.
- `packages/agent-host/providers/opencode.ts` - OpenCode adapter using its SDK/server/session/event APIs; make this the first/default runtime.
- `packages/agent-host/providers/claude.ts` - Claude Agent SDK adapter using `query()`, `resume`, `canUseTool`, and project settings loading.
- `packages/agent-host/providers/codex.ts` - Codex adapter using `startThread()`, `resumeThread()`, and `runStreamed()`.
- `apps/web/lib/sandbox/config.ts` - reserve one routable sandbox port for the agent host in addition to existing dev-server preview ports.
- `apps/web/lib/sandbox/agent-host.ts` - new server-only helper that ensures the host is running inside the sandbox, health-checks it, and signs proxy requests with a deterministic session token.
- `apps/web/lib/db/schema.ts` - add `user_preferences.default_agent_runtime`; add `chats.agent_runtime` and `chats.agent_state` (provider session/thread metadata + pending input state). Reuse `chats.activeStreamId` as the live run pointer instead of adding a second run column.
- `apps/web/lib/db/user-preferences.ts` - load/store the default runtime alongside the default model.
- `apps/web/app/api/settings/preferences/route.ts` - expose runtime preference reads/writes.
- `apps/web/hooks/use-user-preferences.ts` - surface the new default runtime to the client.
- `apps/web/app/settings/preferences-section.tsx` - add the runtime selector and demote/remove settings that are specific to the legacy Open Harness subagent stack.
- `apps/web/components/session-starter.tsx` - thread the selected runtime into session/chat creation defaults.
- `apps/web/app/[username]/[repo]/page.tsx` - seed the initial chat with the chosen runtime.
- `apps/web/app/api/sessions/[sessionId]/chats/route.ts` - create new chats with `agentRuntime` from user preferences.
- `apps/web/app/sessions/[sessionId]/layout.tsx` and `apps/web/hooks/use-session-chats.ts` - preload/runtime-hydrate chat metadata with the selected runtime.
- `apps/web/app/types.ts` - replace the AI SDK-derived `WebAgent*` exports with the new provider-neutral chat/runtime protocol types.
- `apps/web/app/api/sessions/[sessionId]/chats/[chatId]/route.ts` - hydrate persisted chat history using the new normalized schema and return runtime metadata with the chat payload.
- `apps/web/app/api/chat/route.ts` - stop starting Vercel workflows; instead, persist the user turn, ensure the sandbox host is running, start/resume the provider run in the host, proxy the event stream to the browser, and tee persisted events/messages into the DB.
- `apps/web/app/api/chat/[chatId]/stream/route.ts` - reconnect to an active sandbox-host run instead of `workflow/api`.
- `apps/web/app/api/chat/[chatId]/stop/route.ts` - abort the sandbox-host run and clear the live run pointer.
- `apps/web/app/api/chat/[chatId]/input/route.ts` - new route to answer provider approval/question requests and resume paused runs.
- `apps/web/app/sessions/[sessionId]/chats/[chatId]/hooks/use-session-chat-runtime.ts` - replace `@ai-sdk/react` `useChat` transport with a custom SSE/event-source client that talks to the proxy routes.
- `apps/web/app/sessions/[sessionId]/chats/[chatId]/session-chat-context.tsx` - thread runtime metadata and pending input state through context.
- `apps/web/app/sessions/[sessionId]/chats/[chatId]/session-chat-content.tsx` - render the new normalized message/tool/question/approval blocks and add runtime switching UX (new chat when changing runtime after conversation start).
- `apps/web/lib/db/usage.ts` - accept usage payloads emitted by the new host protocol so usage accounting no longer depends on `collectTaskToolUsageEvents` from `@open-harness/agent`.
- `apps/web/app/workflows/chat.ts`, `apps/web/app/workflows/chat-post-finish.ts`, and `apps/web/app/config.ts` - remove from the new chat execution path; delete after the cutover is complete.
- Legacy package note: `packages/agent/*` becomes legacy once the sandbox-host platform is live. Do not extend it for the new system.

Verification:
- Adapter/unit tests:
  - `packages/agent-host/providers/opencode.test.ts` - session create/resume, agent selection, permission/question mapping, streamed event normalization.
  - `packages/agent-host/providers/claude.test.ts` - `resume`, `canUseTool`, question/approval pause handling, and event normalization.
  - `packages/agent-host/providers/codex.test.ts` - thread resume, `runStreamed()` event mapping, and completion metadata.
  - `apps/web/lib/sandbox/agent-host.test.ts` - host bootstrap, auth token generation, health-check, and relaunch logic.
- API tests:
  - `apps/web/app/api/chat/route.test.ts`
  - `apps/web/app/api/chat/[chatId]/stream/route.test.ts`
  - `apps/web/app/api/chat/[chatId]/stop/route.test.ts`
  - `apps/web/app/api/chat/[chatId]/input/route.test.ts`
  - `apps/web/app/api/sessions/[sessionId]/chats/route.test.ts`
  - `apps/web/app/api/settings/preferences/route.test.ts`
- Manual end-to-end checks:
  - create a repo-backed session, choose OpenCode, send a prompt, and confirm all execution happens after bootstrapping the host inside the sandbox
  - reload the page mid-run and reconnect to the active host stream
  - answer a clarifying question / approval request and verify the run resumes
  - stop a run and confirm the host run is aborted and `activeStreamId` clears
  - open a second chat in the same session and switch to Claude or Codex without touching the original chat thread
  - hibernate/resume the sandbox and verify the host is relaunched while provider session/thread IDs still resume from disk-backed state
  - validate that Claude resume works with the same sandbox cwd and that Codex thread IDs survive host restarts
- Repository checks after implementation:
  - `bun run check`
  - `bun run typecheck`
  - `bun run test:isolated`
  - `bun run --cwd apps/web db:check`
- Edge cases to verify:
  - host process missing after sandbox reconnect
  - pending approval/question survives page refresh
  - provider session exists but active run does not
  - runtime switch requested on a non-empty chat (should create a new chat / require an empty chat)
  - missing provider credentials for a chosen runtime
  - sandbox hibernates while no run is active, then resumes and continues the same provider conversation on the next prompt
