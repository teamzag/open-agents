# Model Variants

## Problem

The app hardcodes provider options per model provider (e.g. Anthropic thinking settings, OpenAI reasoning effort). Users have no way to customize these provider-specific parameters — for example, changing `reasoningEffort` from `"high"` to `"medium"`, enabling/disabling `reasoningSummary`, or passing any other provider option supported by the AI SDK gateway. If a user wants to use the same base model with different configurations (e.g. Claude with adaptive thinking vs. without), they have no mechanism to do so.

## Solution

Introduce **Model Variants** — user-defined named presets that wrap any gateway model with arbitrary provider options JSON. A variant acts as a virtual model: it references a base model ID and carries a bag of provider options that get merged (with override semantics) into the defaults at inference time. Variants are fully integrated into model selection across the app, so users can pick them anywhere they'd pick a regular model.

## Changes

### Core domain (`apps/web/lib/model-variants.ts` — new)

- Defines the `ModelVariant` type and Zod schemas for validation (create, update, delete inputs).
- `variant:` prefix convention for variant IDs to distinguish them from real gateway model IDs.
- `resolveModelSelection()` — takes a selected model ID + the user's variant list and returns the resolved base model ID, provider options keyed by provider, and whether the variant is missing.
- `toProviderOptionsByProvider()` — maps flat provider options to the `{ [provider]: options }` shape the AI SDK expects.

### Gateway model layer (`packages/agent/models.ts`)

- Refactored provider options from per-provider `if` blocks into a single `defaultProviderOptions` object that gets built up, then applied once via `defaultSettingsMiddleware`.
- Added `mergeProviderOptions()` — deep-merges user-supplied overrides on top of defaults per provider key.
- `GatewayOptions` now accepts an optional `providerOptionsOverrides` field, threaded through to the merge.

### Persistence

- **Schema** (`apps/web/lib/db/schema.ts`): Added `modelVariants` JSONB column (default `[]`) to the `user_preferences` table.
- **Data layer** (`apps/web/lib/db/user-preferences.ts`): `UserPreferencesData` now includes `modelVariants: ModelVariant[]`. Added `toUserPreferencesData()` helper that parses the JSONB column through Zod validation, centralizing the row-to-domain mapping (previously duplicated in 3 places).

### API routes (`apps/web/app/api/settings/model-variants/route.ts` — new)

- Full CRUD: `GET` (list), `POST` (create), `PATCH` (update), `DELETE` (remove).
- Auth-gated, validates payloads with Zod schemas, enforces a 16 KB size limit on provider options JSON.
- Returns the updated full variant list on every mutation so the client can optimistically update.

### Chat route (`apps/web/app/api/chat/route.ts`)

- Both the main model and the subagent model now go through `resolveModelSelection()`.
- If the selected ID is a variant, the resolved base model ID is used with `gateway()` and the variant's provider options are passed as overrides.
- Graceful fallback: if a variant is missing (deleted after being set), falls back to the default model with a console warning.

### Settings UI

- **New page** (`apps/web/app/settings/model-variants/page.tsx` + `model-variants-section.tsx`): Full management UI — create/edit/delete variants with a name, base model selector, and a JSON textarea for provider options. Added to the settings sidebar with a `SlidersHorizontal` icon.
- **Preferences section** (`apps/web/app/settings/preferences-section.tsx`): The Default Model and Subagent Model selectors now include variants alongside base models. Uses the new `useModelOptions` hook. Handles the edge case of a selected variant that no longer exists (shows `(missing)` label).

### Session chat UI

- **Page** (`apps/web/app/sessions/[sessionId]/chats/[chatId]/page.tsx`): Fetches user preferences in parallel, builds a unified `modelOptions` list (base models + variants) via `buildSessionChatModelOptions()`, passes it down.
- **Content** (`session-chat-content.tsx`): The model selector and the model label display both use the unified options list. Variant-backed chats show the variant name instead of a raw `variant:xxx` ID.

### Shared hooks and components

- **`useModelOptions` hook** (`apps/web/hooks/use-model-options.ts` — new): Fetches both `/api/models` and `/api/settings/model-variants`, merges them into a single `ModelOption[]` array with `id`, `label`, `description`, and `isVariant` flag. Used by the preferences section.
- **`ModelSelectorCompact`** (`apps/web/components/model-selector-compact.tsx`): Refactored from accepting raw `AvailableModel[]` + `isLoading` to accepting pre-built `modelOptions`. Search now indexes label, ID, and description. Variants appear inline alongside base models.

### Tests

- `apps/web/lib/model-variants.test.ts` — unit tests for `resolveModelSelection` and `toProviderOptionsByProvider`.
- `apps/web/app/api/settings/model-variants/route.test.ts` — integration tests for the CRUD API route.
