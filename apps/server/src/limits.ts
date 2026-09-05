import type { Env } from './env.js';

/**
 * Resource limits parsed from env vars. Passed into service calls that create
 * workspaces, canvases, or memberships so the business layer can enforce them.
 * `undefined` fields mean "no limit".
 */
export interface Limits {
  maxWorkspacesPerUser?: number;
  maxCanvasesPerWorkspace?: number;
  maxMembersPerWorkspace?: number;
}

/** Thrown when a resource limit is exceeded; the API layer maps this to 403. */
export class LimitError extends Error {
  constructor(
    message: string,
    readonly limit: keyof Limits,
  ) {
    super(message);
    this.name = 'LimitError';
  }
}

function parsePositiveInt(raw: string | undefined): number | undefined {
  if (raw === undefined || raw === '') return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return Math.floor(n);
}

export function parseLimits(env: Env): Limits {
  return {
    maxWorkspacesPerUser: parsePositiveInt(env.MAX_WORKSPACES_PER_USER) ?? 10,
    maxCanvasesPerWorkspace: parsePositiveInt(env.MAX_CANVASES_PER_WORKSPACE) ?? 100,
    maxMembersPerWorkspace: parsePositiveInt(env.MAX_MEMBERS_PER_WORKSPACE) ?? 50,
  };
}
