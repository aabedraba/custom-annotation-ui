/**
 * Langfuse API Client
 * Handles authentication and base configuration for Langfuse API calls
 */

const LANGFUSE_HOST = process.env.NEXT_PUBLIC_LANGFUSE_HOST || "https://cloud.langfuse.com"
const LANGFUSE_PUBLIC_KEY = process.env.NEXT_PUBLIC_LANGFUSE_PUBLIC_KEY
const LANGFUSE_SECRET_KEY = process.env.LANGFUSE_SECRET_KEY

if (!LANGFUSE_PUBLIC_KEY || !LANGFUSE_SECRET_KEY) {
  console.warn("Langfuse credentials not found in environment variables")
}

/**
 * Creates Basic Auth header for Langfuse API
 */
function getAuthHeader(): string {
  const credentials = `${LANGFUSE_PUBLIC_KEY}:${LANGFUSE_SECRET_KEY}`
  return `Basic ${Buffer.from(credentials).toString("base64")}`
}

/**
 * Base fetch wrapper for Langfuse API calls
 */
export async function langfuseFetch<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${LANGFUSE_HOST}${endpoint}`

  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: getAuthHeader(),
      ...options.headers,
    },
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(
      `Langfuse API error: ${response.status} ${response.statusText} - ${errorText}`
    )
  }

  return response.json()
}

/**
 * Helper for paginated GET requests
 */
export async function langfuseGet<T>(
  endpoint: string,
  params?: Record<string, string | number | boolean | undefined>
): Promise<T> {
  const searchParams = new URLSearchParams()

  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) {
        searchParams.append(key, String(value))
      }
    })
  }

  const queryString = searchParams.toString()
  const fullEndpoint = queryString ? `${endpoint}?${queryString}` : endpoint

  return langfuseFetch<T>(fullEndpoint, { method: "GET" })
}

/**
 * Helper for POST requests
 */
export async function langfusePost<T>(
  endpoint: string,
  body: unknown
): Promise<T> {
  return langfuseFetch<T>(endpoint, {
    method: "POST",
    body: JSON.stringify(body),
  })
}

/**
 * Helper for PATCH requests
 */
export async function langfusePatch<T>(
  endpoint: string,
  body: unknown
): Promise<T> {
  return langfuseFetch<T>(endpoint, {
    method: "PATCH",
    body: JSON.stringify(body),
  })
}

/**
 * Helper for DELETE requests
 */
export async function langfuseDelete<T>(endpoint: string): Promise<T> {
  return langfuseFetch<T>(endpoint, { method: "DELETE" })
}
