import { NextResponse } from "next/server"
import { langfuseGet } from "@/lib/langfuse-client"
import type { PaginatedResponse, AnnotationQueue } from "@/lib/types"

export async function GET() {
  try {
    const response = await langfuseGet<PaginatedResponse<AnnotationQueue>>(
      "/api/public/annotation-queues",
      { page: 1, limit: 100 }
    )

    // Fetch items for each queue to calculate counts
    const queuesWithCounts = await Promise.all(
      response.data.map(async (queue) => {
        try {
          // Fetch items directly from Langfuse API instead of calling our own API route
          const itemsResponse = await langfuseGet<PaginatedResponse<any>>(
            `/api/public/annotation-queues/${queue.id}/items`,
            { page: 1, limit: 100 }
          )

          return {
            ...queue,
            pendingItemCount: itemsResponse.data.filter((item: any) => item.status === "PENDING").length,
            completedItemCount: itemsResponse.data.filter((item: any) => item.status === "COMPLETED").length,
          }
        } catch (error) {
          console.error(`Error fetching items for queue ${queue.id}:`, error)
          return {
            ...queue,
            pendingItemCount: 0,
            completedItemCount: 0,
          }
        }
      })
    )

    return NextResponse.json(queuesWithCounts)
  } catch (error) {
    console.error("Error fetching queues:", error)
    return NextResponse.json(
      { error: "Failed to fetch queues" },
      { status: 500 }
    )
  }
}
