import { NextResponse } from "next/server"
import { langfuseGet } from "@/lib/langfuse-client"
import type { Session } from "@/lib/types"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await params

    const session = await langfuseGet<Session>(
      `/api/public/sessions/${sessionId}`
    )

    return NextResponse.json(session)
  } catch (error) {
    console.error("Error fetching session:", error)
    return NextResponse.json(
      { error: "Failed to fetch session" },
      { status: 500 }
    )
  }
}
