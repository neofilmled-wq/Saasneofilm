const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';

export async function apiFetch<T = any>(path: string, options?: RequestInit): Promise<T> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('neofilm_adv_token') : null;
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  });
  if (res.status === 401) {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('neofilm_adv_token');
      localStorage.removeItem('neofilm_adv_user');
      window.location.href = '/login';
    }
    throw new Error('Unauthorized');
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const details = Array.isArray(err.errors) && err.errors.length
      ? ' — ' + err.errors.map((e: any) => `${e.field}: ${e.message}`).join(', ')
      : '';
    throw new Error((err.message || `API error: ${res.status}`) + details);
  }
  if (res.status === 204) return undefined as T;
  const json = await res.json();
  // Unwrap global TransformInterceptor envelope: { data, statusCode, timestamp }
  if (
    json &&
    typeof json === 'object' &&
    'data' in json &&
    'statusCode' in json &&
    'timestamp' in json
  ) {
    return json.data as T;
  }
  return json as T;
}
