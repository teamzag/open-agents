Summary: Add a template-only non-Vercel message cap that defaults to 5 messages, can be disabled with one env var, is enforced server-side in the chat route, and surfaces remaining messages in the chat composer UI.

Context:
- Chat sends go through `apps/web/app/api/chat/route.ts`, which is the authoritative place to block new messages before a workflow starts.
- Current client-side current-user metadata already flows through `apps/web/app/api/auth/info/route.ts` and `apps/web/hooks/use-session.ts`, making that the coherent place to expose remaining quota to the UI.
- Persisted user messages already live in `chat_messages`, so counting `role = "user"` messages joined through the user’s sessions provides a simple cross-session cap without adding new tables.
- The chat composer UI lives in `apps/web/app/sessions/[sessionId]/chats/[chatId]/session-chat-content.tsx` and already controls submit/disabled state locally.

System Impact:
- Source of truth for enforcement stays server-side in the chat API.
- Source of truth for displaying remaining quota becomes `/api/auth/info`, with the composer reading that state via `useSession()`.
- No new persistent state is introduced; quota is derived from existing chat messages plus a single env-configured limit.
- Forks can disable the entire behavior by setting `NON_VERCEL_MESSAGE_LIMIT=0`.

Approach:
- Add a small shared helper that parses the env var, checks whether the signed-in email is exempt (`vercel.com` only), and computes remaining quota.
- Add a DB helper that counts persisted user messages across all chats/sessions for a user.
- Enforce the cap in the chat route before workflow start, returning a structured error when the limit is exhausted.
- Extend auth info + session hook to expose the remaining quota object to the client.
- Show the remaining quota in the composer and disable input/send when the cap is exhausted.

Changes:
- `apps/web/lib/template-message-limit.ts` - shared config and quota helpers; default to 5, disable with `NON_VERCEL_MESSAGE_LIMIT=0`.
- `apps/web/lib/db/sessions.ts` - add a helper to count persisted user messages for a user across all chats.
- `apps/web/app/api/chat/route.ts` - enforce the cap for non-`vercel.com` emails and return a structured limit error.
- `apps/web/app/api/auth/info/route.ts` - include remaining template quota when the limit applies.
- `apps/web/lib/session/types.ts` and `apps/web/hooks/use-session.ts` - expose the new client session quota shape.
- `apps/web/app/sessions/[sessionId]/chats/[chatId]/session-chat-content.tsx` - render remaining count near the textarea, optimistically update it on send, and disable input when exhausted.
- `apps/web/app/api/chat/route.test.ts` - cover allowed fifth message, blocked sixth message, and exempt `vercel.com` behavior.

Verification:
- Run chat route tests for the limit scenarios.
- Verify the composer shows remaining count and becomes disabled at zero.
- Run `bun run ci`.
