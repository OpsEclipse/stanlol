# UI Guide

This document defines UI structure and styling conventions.

## Current State

- The repository currently uses the Next.js App Router under `app/`.
- Tailwind is available in the project dependencies.
- A dedicated `components/` directory exists for reusable presentational UI.

## Conventions

- Use Tailwind utility classes for styling.
- Do not use inline styles, CSS modules, or styled-components.
- Keep reusable presentational UI in `components/` once shared components are introduced.
- Keep data access and AI logic out of components.
- Split large components before they become difficult to reason about.

## When UI Grows

Document the following here:

- Shared component inventory
- Design tokens and spacing conventions
- Typography rules
- Responsive layout rules
- Accessibility expectations
