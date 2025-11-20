import { NextResponse } from "next/server"
import { langfuseGet } from "@/lib/langfuse-client"
import type { AnnotationQueue, PaginatedResponse, QueueItem } from "@/lib/types"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ queueId: string }> }
) {
  try {
    const { queueId } = await params

    const queue = await langfuseGet<AnnotationQueue>(
      `/api/public/annotation-queues/${queueId}`
    )

    // Fetch items to calculate counts
    const itemsResponse = await langfuseGet<PaginatedResponse<QueueItem>>(
      `/api/public/annotation-queues/${queueId}/items`,
      { page: 1, limit: 100 }
    )

    const queueWithCounts = {
      ...queue,
      pendingItemCount: itemsResponse.data.filter((item) => item.status === "PENDING").length,
      completedItemCount: itemsResponse.data.filter((item) => item.status === "COMPLETED").length,
    }

    return NextResponse.json(queueWithCounts)
  } catch (error) {
    console.error("Error fetching queue:", error)
    return NextResponse.json(
      { error: "Failed to fetch queue" },
      { status: 500 }
    )
  }
}
