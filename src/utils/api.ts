// Centralized, bulletproof API helper for both AI Studio and Netlify / Vercel deployments.
// Prevents "JSON.parse: unexpected end of data at line 1 column 1 of the JSON data" errors.

const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

/**
 * Resolves full API URL based on VITE_API_URL if configured, or uses relative path.
 */
export function getApiUrl(path: string): string {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  if (!API_BASE) {
    return cleanPath;
  }
  return `${API_BASE}${cleanPath}`;
}

/**
 * Safely parses JSON response without throwing SyntaxError when receiving
 * empty body (0 bytes), HTML 404/500 error pages, or non-JSON payloads.
 */
export async function safeJson<T = any>(res: Response | null | undefined): Promise<T | null> {
  if (!res) return null;
  try {
    const text = await res.text();
    if (!text || !text.trim()) {
      return null;
    }
    const trimmed = text.trim();
    // Guard against HTML error pages returned by CDN / Netlify
    if (trimmed.startsWith('<') || trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html')) {
      return null;
    }
    return JSON.parse(trimmed) as T;
  } catch (err) {
    console.warn('safeJson parsing warning:', err);
    return null;
  }
}

/**
 * Wrapper around standard fetch that resolves the target URL and handles abort/errors.
 */
export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const url = getApiUrl(path);
  return fetch(url, init);
}

/**
 * High-level helper that performs fetch and safe JSON parsing in one call.
 */
export async function apiJson<T = any>(
  path: string,
  init?: RequestInit
): Promise<{ ok: boolean; status: number; data: T | null; error?: string }> {
  try {
    const res = await apiFetch(path, init);
    const data = await safeJson<T>(res);
    let errorMessage = '';

    if (!res.ok) {
      errorMessage =
        (data as any)?.error ||
        (data as any)?.message ||
        `İstek başarısız oldu (HTTP ${res.status}).`;
    }

    return {
      ok: res.ok,
      status: res.status,
      data,
      error: errorMessage || undefined,
    };
  } catch (err: unknown) {
    return {
      ok: false,
      status: 0,
      data: null,
      error: 'Sunucuya bağlanılamadı. Lütfen internet bağlantınızı ve API yönlendirmesini kontrol ediniz.',
    };
  }
}
