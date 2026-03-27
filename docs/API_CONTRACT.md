# API Contract

This document records every API route and its request and response shape.

## Current State

- No application API routes exist yet under `app/api/`.

## Route Contract Rules

- All API routes must live in `app/api/`.
- Every route must validate input before processing.
- Every route must return JSON in the shape `{ success: boolean, data?: unknown, error?: string }`.
- Use `try`/`catch` in handlers and shared service functions.

## Documentation Format

For each route, document:

- Route path
- HTTP method
- Input shape
- Validation rules
- Success response
- Error response
- Auth requirements
- Side effects
