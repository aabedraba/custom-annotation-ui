/**
 * Browser-safe Langfuse client
 * Only uses the public key - safe to use in client-side code
 */
import { LangfuseWeb } from "langfuse"

// Initialize LangfuseWeb with only the public key
export const langfuseWeb = new LangfuseWeb({
  publicKey: process.env.NEXT_PUBLIC_LANGFUSE_PUBLIC_KEY!,
  baseUrl: process.env.NEXT_PUBLIC_LANGFUSE_HOST || "https://cloud.langfuse.com",
})

// Helper function to submit a single score (without flushing)
export async function submitScore(params: {
  traceId?: string
  observationId?: string
  sessionId?: string
  name: string
  value: number
  comment?: string
  configId?: string
  dataType?: "NUMERIC" | "CATEGORICAL" | "BOOLEAN"
  queueId?: string
}) {
  try {
    // Note: LangfuseWeb.score() doesn't directly support sessionId
    // For session-level scores, the UI should pass the sessionId as metadata
    // or use the session's first trace ID
    const scorePayload: any = {
      name: params.name,
      value: params.value,
      configId: params.configId,
    }

    // Add optional fields only if they exist
    if (params.traceId) scorePayload.traceId = params.traceId
    if (params.observationId) scorePayload.observationId = params.observationId
    if (params.comment) scorePayload.comment = params.comment

    // Queue the score (don't flush yet - caller will flush all at once)
    langfuseWeb.score(scorePayload)
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error("Error submitting score to Langfuse:", {
      error: errorMessage,
      scoreName: params.name,
      traceId: params.traceId,
      configId: params.configId,
    })
    throw new Error(`Failed to submit score "${params.name}": ${errorMessage}`)
  }
}

// Flush all pending scores to Langfuse
export async function flushScores() {
  return langfuseWeb.flush()
}
