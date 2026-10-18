import axios from "axios";

// Updated line below:
export const api = axios.create({
  baseURL:
    (import.meta as unknown as { env: Record<string, string> }).env
      .VITE_API_URL || "/api",
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (error) => {
    if (
      error?.response?.status === 401 &&
      !window.location.pathname.startsWith("/login")
    ) {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      window.location.href = "/login";
    }
    return Promise.reject(error);
  },
);

export function apiErrorMessage(
  error: unknown,
  fallback = "Something went wrong",
): string {
  return apiError(error, fallback).message;
}

export interface ApiFailure {
  message: string;
  /** HTTP status, or null when the request never reached the server. */
  status: number | null;
}

/**
 * Same message resolution as apiErrorMessage, but keeps the status so a
 * caller can branch on it - ItemDetail only offers the waitlist when the
 * reservation failed with 409 (dates taken), not on a network blip.
 */
export function apiError(
  error: unknown,
  fallback = "Something went wrong",
): ApiFailure {
  if (axios.isAxiosError(error)) {
    const response = error.response;
    return {
      message:
        (response?.data as { message?: string } | undefined)?.message ??
        error.message ??
        fallback,
      status: response?.status ?? null,
    };
  }
  return { message: fallback, status: null };
}

export async function downloadFile(
  url: string,
  filename: string,
): Promise<void> {
  const res = await api.get(url, { responseType: "blob" });
  const blobUrl = URL.createObjectURL(res.data);
  const a = document.createElement("a");
  a.href = blobUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(blobUrl);
}
