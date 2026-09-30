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
  if (axios.isAxiosError(error)) {
    return (
      (error.response?.data as { message?: string } | undefined)?.message ??
      error.message ??
      fallback
    );
  }
  return fallback;
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
