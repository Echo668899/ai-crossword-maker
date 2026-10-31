/** Same-origin `/api` in `astro dev` (Vite proxy); optional absolute base for preview. */
export function apiUrl(path: string): string {
  const base = (import.meta.env.PUBLIC_API_BASE_URL as string | undefined)?.replace(/\/$/, "") ?? "";
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${base}${p}`;
}

export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(apiUrl(path), {
    credentials: "include",
    ...init,
    headers: {
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...init?.headers,
    },
  });
}
