# Agents Guide

This document describes how agent behavior is implemented in the codebase.

## Current State

- No runtime agent orchestration code exists yet.
- The intended home for agent logic is `lib/agents/`.
- The intended home for OpenAI access is `lib/ai.ts`.

## Required Patterns

- Keep prompt templates, tool wiring, and orchestration in `lib/agents/`.
- Keep direct model calls inside `lib/ai.ts`.
- Give every agent flow an explicit termination condition.
- Keep reusable prompt fragments and output contracts versioned in code.

## When Implementation Starts

Document the following here:

- Agent entrypoints
- Prompt patterns
- Tool usage patterns
- Loop and termination behavior
- Error recovery strategy
- Guardrails and validation
