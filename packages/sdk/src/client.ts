import type {
  CanvasMeta,
  CanvasOwner,
  CanvasRecord,
  Invitation,
  InvitationPreview,
  Role,
  User,
  Workspace,
  WorkspaceMember,
} from './domain.js';
import type { Store } from './store.js';

export interface HttpStoreOptions {
  baseUrl: string;
  getToken?: () => string | null;
  fetchImpl?: typeof fetch;
  onUnauthorized?: () => void;
}

/** localStorage key used to persist the signed JWT (shared by web + server flows). */
export const TOKEN_STORAGE_KEY = 'esbuddy.token';

export class HttpStore implements Store {
  private readonly baseUrl: string;
  private readonly getToken: () => string | null;
  private readonly fetchImpl: typeof fetch;
  private readonly onUnauthorized: (() => void) | undefined;

  constructor(options: HttpStoreOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.getToken =
      options.getToken ??
      (() => {
        try {
          return typeof localStorage === 'undefined' ? null : localStorage.getItem(TOKEN_STORAGE_KEY);
        } catch {
          return null;
        }
      });
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.onUnauthorized = options.onUnauthorized;
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    const token = this.getToken();
    if (token) headers.authorization = `Bearer ${token}`;

    const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    if (res.status === 401) this.onUnauthorized?.();
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status} ${method} ${path}: ${text}`);
    }
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  getCurrentUser(): Promise<User | null> {
    return this.request<User | null>('GET', '/auth/me');
  }

  listWorkspaces(): Promise<Workspace[]> {
    return this.request<Workspace[]>('GET', '/workspaces');
  }

  listMembers(workspaceId: string): Promise<WorkspaceMember[]> {
    return this.request<WorkspaceMember[]>('GET', `/workspaces/${workspaceId}/members`);
  }

  createWorkspace(name: string): Promise<Workspace> {
    return this.request<Workspace>('POST', '/workspaces', { name });
  }

  createInvitation(workspaceId: string, role: Role): Promise<Invitation> {
    return this.request<Invitation>('POST', `/workspaces/${workspaceId}/invitations`, { role });
  }

  previewInvitation(token: string): Promise<InvitationPreview> {
    return this.request<InvitationPreview>('GET', `/invitations/${token}`);
  }

  acceptInvitation(token: string): Promise<Workspace> {
    return this.request<Workspace>('POST', `/invitations/${token}/accept`);
  }

  listCanvases(scope?: { userId?: string; workspaceId?: string }): Promise<CanvasMeta[]> {
    const params = new URLSearchParams();
    if (scope?.workspaceId) params.set('workspace', scope.workspaceId);
    const qs = params.toString();
    return this.request<CanvasMeta[]>('GET', `/canvases${qs ? `?${qs}` : ''}`);
  }

  getCanvas(id: string): Promise<CanvasRecord | null> {
    return this.request<CanvasRecord | null>('GET', `/canvases/${id}`);
  }

  createCanvas(name: string, owner?: CanvasOwner): Promise<CanvasMeta> {
    return this.request<CanvasMeta>('POST', '/canvases', { name, owner });
  }

  renameCanvas(id: string, name: string): Promise<CanvasMeta> {
    return this.request<CanvasMeta>('PATCH', `/canvases/${id}`, { name });
  }

  deleteCanvas(id: string): Promise<void> {
    return this.request<void>('DELETE', `/canvases/${id}`);
  }
}
