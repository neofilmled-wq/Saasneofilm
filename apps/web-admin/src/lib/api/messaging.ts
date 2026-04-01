const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';

function getHeaders(): HeadersInit {
  const token = typeof window !== 'undefined' ? localStorage.getItem('neofilm_admin_token') : null;
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

let isRefreshing = false;
let refreshPromise: Promise<boolean> | null = null;

async function tryRefreshToken(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  const refreshToken = localStorage.getItem('neofilm_admin_refresh');
  if (!refreshToken) return false;

  try {
    const res = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) return false;

    const json = await res.json();
    const data = json.data ?? json;
    if (data.accessToken) {
      localStorage.setItem('neofilm_admin_token', data.accessToken);
      if (data.refreshToken) {
        localStorage.setItem('neofilm_admin_refresh', data.refreshToken);
      }
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

async function refreshTokenIfNeeded(): Promise<boolean> {
  if (isRefreshing && refreshPromise) return refreshPromise;
  isRefreshing = true;
  refreshPromise = tryRefreshToken().finally(() => {
    isRefreshing = false;
    refreshPromise = null;
  });
  return refreshPromise;
}

async function handleResponse(res: Response, retryFn?: () => Promise<Response>): Promise<any> {
  if (res.status === 401 && retryFn && typeof window !== 'undefined') {
    const refreshed = await refreshTokenIfNeeded();
    if (refreshed) {
      const retryRes = await retryFn();
      if (retryRes.ok) {
        const json = await retryRes.json();
        return json.data ?? json;
      }
    }
    localStorage.removeItem('neofilm_admin_token');
    localStorage.removeItem('neofilm_admin_user');
    localStorage.removeItem('neofilm_admin_refresh');
    window.location.href = '/login';
    throw new Error('Session expirée, veuillez vous reconnecter');
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Request failed (${res.status})`);
  }
  const json = await res.json();
  return json.data ?? json;
}

// ── Admin conversations ──

export async function fetchAdminConversations(params?: {
  status?: string;
  unreadOnly?: boolean;
  q?: string;
  orgType?: string;
  page?: number;
  limit?: number;
}) {
  const query = new URLSearchParams();
  if (params?.status) query.set('status', params.status);
  if (params?.unreadOnly) query.set('unreadOnly', 'true');
  if (params?.q) query.set('q', params.q);
  if (params?.orgType) query.set('orgType', params.orgType);
  if (params?.page) query.set('page', String(params.page));
  if (params?.limit) query.set('limit', String(params.limit));

  const url = `${API_URL}/admin/conversations?${query}`;
  const res = await fetch(url, { headers: getHeaders() });
  return handleResponse(res, () => fetch(url, { headers: getHeaders() }));
}

export async function fetchAdminConversation(id: string) {
  const url = `${API_URL}/admin/conversations/${id}`;
  const res = await fetch(url, { headers: getHeaders() });
  return handleResponse(res, () => fetch(url, { headers: getHeaders() }));
}

export async function adminSendMessage(conversationId: string, body: string) {
  const opts = { method: 'POST' as const, headers: getHeaders(), body: JSON.stringify({ body }) };
  const url = `${API_URL}/admin/conversations/${conversationId}/messages`;
  const res = await fetch(url, opts);
  return handleResponse(res, () => fetch(url, { ...opts, headers: getHeaders() }));
}

export async function adminMarkRead(conversationId: string) {
  const url = `${API_URL}/admin/conversations/${conversationId}/read`;
  const res = await fetch(url, { method: 'POST', headers: getHeaders() });
  return handleResponse(res, () => fetch(url, { method: 'POST', headers: getHeaders() }));
}

export async function adminCloseConversation(conversationId: string) {
  const url = `${API_URL}/admin/conversations/${conversationId}/close`;
  const res = await fetch(url, { method: 'POST', headers: getHeaders() });
  return handleResponse(res, () => fetch(url, { method: 'POST', headers: getHeaders() }));
}

export async function adminArchiveConversation(conversationId: string) {
  const url = `${API_URL}/admin/conversations/${conversationId}/archive`;
  const res = await fetch(url, { method: 'POST', headers: getHeaders() });
  return handleResponse(res, () => fetch(url, { method: 'POST', headers: getHeaders() }));
}

export async function adminReopenConversation(conversationId: string) {
  const url = `${API_URL}/admin/conversations/${conversationId}/reopen`;
  const res = await fetch(url, { method: 'POST', headers: getHeaders() });
  return handleResponse(res, () => fetch(url, { method: 'POST', headers: getHeaders() }));
}

export async function fetchAdminUnreadCount(): Promise<{ count: number }> {
  const url = `${API_URL}/admin/conversations/unread-count`;
  const res = await fetch(url, { headers: getHeaders() });
  return handleResponse(res, () => fetch(url, { headers: getHeaders() }));
}
