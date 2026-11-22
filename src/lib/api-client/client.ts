export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  csrfToken?: string;
  signal?: AbortSignal;
}

export async function apiRequest<T>(
  path: string,
  { method = "GET", body, csrfToken, signal }: RequestOptions = {},
): Promise<T> {
  const headers = new Headers({ Accept: "application/json" });
  if (body !== undefined) headers.set("Content-Type", "application/json");
  if (csrfToken) headers.set("X-CSRF-Token", csrfToken);

  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: "same-origin",
      cache: "no-store",
      signal,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new ApiError(0, "Cannot reach the server. Please try again.");
  }

  if (!response.ok) {
    if (response.status === 401 && typeof window !== "undefined") {
      window.dispatchEvent(new Event("serendipity:unauthorized"));
    }
    let message = "The request could not be completed. Please try again.";
    try {
      const data: unknown = await response.json();
      if (
        typeof data === "object" &&
        data !== null &&
        "detail" in data &&
        typeof data.detail === "string"
      ) {
        message = data.detail;
      }
    } catch {
      // Proxies may return HTML instead of the API's JSON error response.
    }
    throw new ApiError(response.status, message);
  }

  if (response.status === 204) return undefined as T;
  try {
    return (await response.json()) as T;
  } catch {
    throw new ApiError(response.status, "The server returned an invalid response.");
  }
}
