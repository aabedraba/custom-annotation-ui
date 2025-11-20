import { NextResponse } from "next/server"
import { langfuseGet } from "@/lib/langfuse-client"
import type { ScoreConfig } from "@/lib/types"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ configId: string }> }
) {
  try {
    const { configId } = await params
    const scoreConfig = await langfuseGet<ScoreConfig>(
      `/api/public/score-configs/${configId}`
    )

    return NextResponse.json(scoreConfig)
  } catch (error) {
    console.error("Error fetching score config:", error)
    return NextResponse.json(
      { error: "Failed to fetch score config" },
      { status: 500 }
    )
  }
}
