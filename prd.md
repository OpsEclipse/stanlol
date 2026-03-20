# Stanlol PRD

## Product Summary

Stanlol is a chat-first web app for drafting LinkedIn posts. The product should feel minimal and premium, with a workspace inspired by tools like Stanley and Harvey AI: a sparse left sidebar, a focused chat surface in the middle, and a draft panel that appears on the right once the assistant has enough context to produce a post.

The user signs in, chats naturally about what they want to say, and the assistant converts that conversation into a polished LinkedIn draft. The user can keep chatting to refine the same draft, switch between saved writing voices, attach an image, copy the finished post, and jump to LinkedIn to publish manually.

## Problem

Writing a strong LinkedIn post usually takes too long. The user has to think through the angle, tighten the structure, choose the right tone, decide how polished or personal it should feel, and then rewrite it until it sounds like them. Most existing tools either feel like rigid form-fillers or generic chatbots with weak output handoff.

The opportunity is to make LinkedIn writing feel like a focused creative workflow: talk through the idea conversationally, let the assistant synthesize it into a draft at the right moment, and keep the final output ready for immediate posting.

## Vision

Build the fastest way for a professional to go from rough thought to polished LinkedIn post through a calm, chat-first interface.

## Goals

- Let users create a usable LinkedIn draft from natural conversation.
- Keep the interface minimal, full-screen, and highly focused.
- Support persistent writing voices that shape generation quality.
- Let users refine the draft without leaving the chat thread.
- Make final handoff to LinkedIn extremely fast.
- Support image attachment as part of the draft workflow.

## Non-Goals

- Direct publishing to LinkedIn in v1.
- Post scheduling in v1.
- Referencing public posts from other people in v1.
- Using unsupported "sign in with your ChatGPT consumer account" flows for the standalone app.
- Building a general-purpose multi-agent system in v1.
- Building a branching, multi-draft editor in v1.

## Target Users

- Founders building a personal brand on LinkedIn.
- Operators and consultants who post thought leadership regularly.
- Creators who want a faster way to turn ideas into polished posts.
- Professionals who want AI help without losing their personal voice.

## Core Product Principles

- Chat first, not form first.
- Minimal chrome, maximum focus.
- One thread should feel like one working session.
- The assistant should help the user get to a draft quickly, not make them manage a complex workflow.
- The right panel should feel like a live deliverable, not a side note.
- Voice and memory should improve quality over time.

## Primary User Experience

### Layout

The main authenticated experience is a full-height workspace with three possible regions:

- Left sidebar for conversation history and account/settings.
- Center panel for the active chat.
- Right panel for the current LinkedIn draft.

The right panel starts hidden. Before a draft exists, the interface reads as a two-panel layout: sidebar plus chat. Once the assistant produces a draft, the right panel slides in and becomes persistent for that thread.

### Left Sidebar

The left sidebar should remain visually quiet and functional.

It includes:

- Conversation history.
- New chat action.
- User profile entry.
- Settings entry near the bottom.

It should not contain complex navigation or dense controls.

### Center Chat Panel

The center panel is the primary working surface.

It includes:

- Full conversation stream.
- Chat input anchored near the bottom.
- Voice selector in the composer area.
- Image upload action in the composer area.

The user can type anything naturally. The assistant should behave like a strong writing collaborator, helping the user shape angle, tone, structure, and clarity. The assistant should not force the user through a rigid step-by-step form.

### Right Draft Panel

The right panel contains the active LinkedIn draft for the current thread.

It includes:

- Latest draft text.
- Copy action.
- `Go to LinkedIn` action.
- Attached image preview when present.
- Optional lightweight metadata such as active voice or last updated time.

The user should be able to continue chatting in the center panel while seeing the draft update on the right.

## Core Interaction Model

- Each chat thread has one active draft.
- The assistant decides when the conversation has enough signal to generate the first draft.
- After a draft exists, later chat turns can refine that same draft.
- Each draft update should create a saved revision.
- Reopening a conversation should restore both the message history and the current draft state.

This keeps the experience simple while still preserving progress and iteration history.

## Writing Voice System

The product should support reusable voices that shape how the assistant writes.

Each voice should include:

- A name.
- A short optional description.
- Writing instructions or system-prompt-style guidance.
- Optional imported writing samples.

Users should be able to:

- Create a voice.
- Edit a voice.
- Delete a voice.
- Select a voice inside the chat workflow.

Voice choice should materially affect post tone, style, pacing, and structure.

## Voice Import

The preferred experience is to let the user import their own LinkedIn writing history into a voice. This should be treated as a user-owned style-enrichment workflow, not as general web scraping.

Two supported paths are required:

1. LinkedIn-based import if the integration is available.
2. Manual import fallback by pasting post text or uploading a text or CSV file.

Manual import must remain the guaranteed path. The PRD should not assume LinkedIn retrieval access is always available.

## Image Support

V1 supports attaching an existing image to the draft workflow.

The user should be able to upload an image and associate it with the active draft. The image should remain visible in the draft panel and persist with the draft record. V1 does not need AI image generation.

## Authentication And Accounts

The app uses Supabase for authentication and persistence.

Supported sign-in methods:

- Google OAuth.
- Email magic link.

For development only, the product should support an environment-flagged auto-login path into a seeded test account. This bypass must be strictly local-only and disabled in preview and production environments.

## Persistence

The app should persist the following per user:

- Chat threads.
- Chat messages.
- Voice profiles.
- Imported voice samples.
- Drafts.
- Draft revisions.
- Uploaded images.
- Generation history or audit events as needed for debugging and product insight.

## Functional Requirements

### Chat

- User can create a new thread.
- User can see prior threads in the sidebar.
- User can reopen an existing thread.
- User can continue a prior thread and refine the same draft.

### Drafting

- Assistant can decide when to produce the first draft.
- Assistant can revise the active draft based on later user instructions.
- User can copy the latest draft quickly.
- User can open LinkedIn from the draft panel for manual posting.

### Voices

- User can create, edit, delete, and select voices.
- Voice selection affects future draft generations in the thread.
- User can enrich a voice with imported writing samples.

### Assets

- User can attach an image to a draft.
- Image stays associated with the draft across sessions.

### Settings

- User can access basic account and workspace settings from the sidebar.
- Settings scope in v1 should stay light and not distract from the main workflow.

## Technical Product Shape

The app should follow the repository architecture constraints.

- Use Next.js App Router.
- Use Tailwind for styling.
- Use Supabase for database access and authentication.
- Route all OpenAI access through repository wrappers.
- Keep reusable UI presentational.
- Keep API logic inside `app/api/`.

## Planned API Surface

These are the product-facing routes the implementation should support or plan for:

- `POST /api/chat/threads`
- `GET /api/chat/threads`
- `GET /api/chat/threads/:id`
- `POST /api/chat/threads/:id/messages`
- `GET|POST|PATCH|DELETE /api/voices`
- `POST /api/voices/import-linkedin`
- `POST /api/voices/import-manual`
- `GET|POST|PATCH /api/drafts`
- `POST /api/uploads`
- `POST /api/dev/auto-login`

All routes should validate input and return the standard JSON envelope:

`{ success: boolean, data?: unknown, error?: string }`

## Data Model Requirements

The product should support these core entities:

- User profile.
- Chat thread.
- Chat message.
- Voice profile.
- Voice sample or import record.
- Draft.
- Draft revision.
- Uploaded asset.

Relationships should support:

- One user to many threads.
- One thread to many messages.
- One thread to one active draft.
- One draft to many revisions.
- One user to many voices.
- One voice to many samples.

## Draft Generation Behavior

V1 should not behave like an open-ended autonomous agent. It should behave like a controlled chat assistant with explicit product boundaries.

The assistant should:

- Read the active thread context.
- Read the selected voice and any relevant imported samples.
- Decide whether the thread is still exploratory or ready for draft generation.
- Generate or revise the active draft.

The assistant should not:

- Spawn arbitrary long-running loops.
- Call third-party tools without explicit product purpose.
- Create multiple competing draft branches by default.

## Success Metrics

Key early metrics:

- Time from first user message to first draft.
- Percent of threads that reach a copied draft.
- Percent of drafted posts that get at least one refinement.
- Voice reuse rate across sessions.
- Import completion rate for voice setup.

## Risks

### LinkedIn Import Risk

Importing a user's own posts through LinkedIn may be constrained by platform permissions. The product must preserve manual import as the guaranteed fallback.

### Over-automation Risk

If the assistant creates drafts too early or too aggressively, the chat experience may feel jumpy or presumptuous. The generation threshold should be tuned carefully.

### Generic Output Risk

Without a strong voice system and sample ingestion, outputs may feel bland. Voice quality is central to product quality.

### UI Clutter Risk

This product can easily drift into a cluttered productivity app. The design must stay minimal and centered on chat plus draft.

## Acceptance Criteria

- User can sign in with Google or magic link.
- User lands in a full-screen workspace with sidebar and chat.
- User can create and reopen chat threads.
- Assistant can generate a first LinkedIn draft from a conversation.
- The right panel appears when the first draft is ready.
- User can keep chatting to refine the active draft.
- Draft revisions are saved.
- User can create and switch voices.
- User can import voice material manually.
- User can attach an image to the draft.
- User can copy the draft.
- User can click `Go to LinkedIn` and continue manual posting outside the app.
- Dev auto-login works only when explicitly enabled in local development.

## Explicit Defaults

- Chat-first UX is the primary product interaction.
- One active draft per thread.
- Assistant decides when to create the first draft.
- Right draft panel is hidden until a draft exists.
- Supabase is the source of truth for auth and persistence.
- Backend-owned OpenAI integration is the supported v1 model.
- LinkedIn direct publishing is out of scope.
- Public-post reference import is out of scope for v1.

## V1 Summary

Stanlol v1 should feel like sitting down with a sharp writing partner in a clean workspace. The user chats, the assistant synthesizes, a draft appears when it is ready, and the final handoff to LinkedIn is immediate. The combination of minimal UI, persistent voices, conversational iteration, and strong draft presentation is the product.
