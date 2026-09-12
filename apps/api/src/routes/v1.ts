import type { FastifyInstance } from 'fastify';

// Versioned root (ADR-011): every product endpoint lives under /v1. Registered
// here with the prefix, deliberately empty — the first real route is CR-011
// (POST /v1/auth/register). Future feature modules (auth, rides, routes,
// registrations, ...) register themselves here, one per capability
// (.claude/rules/architecture.md), instead of every route living in this file.
export async function v1Routes(_app: FastifyInstance) {}
