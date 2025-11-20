import { NextResponse } from "next/server"
import { langfuseGet, langfusePatch } from "@/lib/langfuse-client"
import type { QueueItem } from "@/lib/types"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ queueId: string; itemId: string }> }
) {
  try {
    const { queueId, itemId } = await params

    const item = await langfuseGet<QueueItem>(
      `/api/public/annotation-queues/${queueId}/items/${itemId}`
    )

    return NextResponse.json(item)
  } catch (error) {
    console.error("Error fetching queue item:", error)
    return NextResponse.json(
      { error: "Failed to fetch queue item" },
      { status: 500 }
    )
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ queueId: string; itemId: string }> }
) {
  try {
    const { queueId, itemId } = await params
    const body = await request.json()

    const item = await langfusePatch<QueueItem>(
      `/api/public/annotation-queues/${queueId}/items/${itemId}`,
      body
    )

    return NextResponse.json(item)
  } catch (error) {
    console.error("Error updating queue item:", error)
    return NextResponse.json(
      { error: "Failed to update queue item" },
      { status: 500 }
    )
  }
}
