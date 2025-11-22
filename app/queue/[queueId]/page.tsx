"use client"

import { useEffect, useState, useCallback, useMemo } from "react"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import { api } from "@/lib/api"
import { submitScore, flushScores } from "@/lib/langfuse-web"
import type { QueueItem, ChatMessage, ScoreConfig, AnnotationQueue, Score } from "@/lib/types"
import { ChatBubble } from "@/components/annotation/chat-bubble"
import { ScorePanel } from "@/components/annotation/score-panel"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { ChevronLeft, ChevronRight, ArrowLeft } from "lucide-react"
import Link from "next/link"
import { cn } from "@/lib/utils"

// Helper function to normalize trace input/output to ChatMessage format
function normalizeTraceMessages(trace: any): ChatMessage[] {
  const messages: ChatMessage[] = []

  // Handle input
  if (Array.isArray(trace.input)) {
    messages.push(...trace.input.map((msg: any) => ({
      ...msg,
      timestamp: msg.timestamp || trace.timestamp
    })))
  } else if (typeof trace.input === "string") {
    messages.push({ role: "user" as const, content: trace.input, timestamp: trace.timestamp })
  } else if (typeof trace.input === "object" && trace.input?.role && trace.input?.content) {
    messages.push({ ...trace.input, timestamp: trace.input.timestamp || trace.timestamp })
  }

  // Handle output
  if (Array.isArray(trace.output)) {
    trace.output.forEach((item: any) => {
      if (item.role && item.content) {
        // Standard ChatMessage format
        messages.push(item)
      } else if (item.text) {
        // OpenAI/Anthropic message content format with {type, text}
        messages.push({ role: "assistant" as const, content: item.text, timestamp: trace.timestamp })
      }
    })
  } else if (typeof trace.output === "string") {
    messages.push({ role: "assistant" as const, content: trace.output, timestamp: trace.timestamp })
  } else if (typeof trace.output === "object" && trace.output?.role && trace.output?.content) {
    messages.push(trace.output)
  }

  return messages
}

export default function AnnotationInterface() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const queueId = params.queueId as string

  const [items, setItems] = useState<QueueItem[]>([])
  const [loading, setLoading] = useState(true)
  const [currentData, setCurrentData] = useState<{ messages: ChatMessage[]; scores?: Score[]; context?: any } | null>(null)
  const [loadingItem, setLoadingItem] = useState(false)
  const [queue, setQueue] = useState<AnnotationQueue | null>(null)
  const [scoreConfigs, setScoreConfigs] = useState<ScoreConfig[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Derive currentIndex from URL (single source of truth)
  const currentIndex = useMemo(() => {
    const itemId = searchParams.get('itemId')
    if (!itemId || items.length === 0) return 0
    const index = items.findIndex(item => item.id === itemId)
    return index !== -1 ? index : 0
  }, [searchParams, items])

  // Fetch queue, items, and score configs on mount
  useEffect(() => {
    const fetchQueueData = async () => {
      try {
        // Fetch queue details and items in parallel
        const [queueData, queueItems] = await Promise.all([
          api.getQueue(queueId),
          api.getQueueItems(queueId),
        ])

        setItems(queueItems)
        setQueue(queueData || null)

        // Set initial URL if no itemId in URL
        const itemId = searchParams.get('itemId')
        if (!itemId && queueItems.length > 0) {
          router.replace(`/queue/${queueId}?itemId=${queueItems[0].id}`, { scroll: false })
        }

        // Fetch all score configs
        if (queueData?.scoreConfigIds && queueData.scoreConfigIds.length > 0) {
          const configs = await Promise.all(
            queueData.scoreConfigIds.map(configId => api.getScoreConfig(configId))
          )
          // Filter out any undefined configs (in case of fetch errors)
          setScoreConfigs(configs.filter((c): c is ScoreConfig => c !== undefined))
        }
      } catch (error) {
        console.error("Failed to fetch queue data", error)
      } finally {
        setLoading(false)
      }
    }
    fetchQueueData()
    // Only run on mount or when queueId changes - searchParams and router are stable
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queueId])

  // Fetch details for the current item
  useEffect(() => {
    if (items.length === 0) return

    const item = items[currentIndex]
    // Guard: check if item exists at current index
    if (!item) {
      setLoadingItem(false)
      return
    }

    const fetchItemDetails = async () => {
      setLoadingItem(true)
      const messages: ChatMessage[] = []
      let scores: Score[] = []

      try {
        if (item.objectType === "SESSION") {
          const session = await api.getSession(item.objectId)
          if (session) {
            // Flatten all traces into messages
            session.traces.forEach((trace) => {
              messages.push(...normalizeTraceMessages(trace))
              // Collect scores from all traces in the session
              if (trace.scores) {
                scores.push(...trace.scores)
              }
            })
          }
        } else if (item.objectType === "TRACE") {
          const trace = await api.getTrace(item.objectId)
          if (trace) {
            messages.push(...normalizeTraceMessages(trace))
            // Extract scores from the trace
            if (trace.scores) {
              scores = trace.scores
            }
          }
        }

        // Sort messages by timestamp if available
        messages.sort((a, b) => {
          if (!a.timestamp || !b.timestamp) return 0
          return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        })

        setCurrentData({ messages, scores })
      } catch (error) {
        console.error("Failed to fetch item details", error)
      } finally {
        setLoadingItem(false)
      }
    }

    fetchItemDetails()
    // Depend only on currentIndex, which already recomputes when items/searchParams change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex])

  const handleNext = useCallback(() => {
    if (currentIndex < items.length - 1) {
      const nextItem = items[currentIndex + 1]
      router.push(`/queue/${queueId}?itemId=${nextItem.id}`, { scroll: false })
    }
  }, [currentIndex, items, queueId, router])

  const handlePrev = useCallback(() => {
    if (currentIndex > 0) {
      const prevItem = items[currentIndex - 1]
      router.push(`/queue/${queueId}?itemId=${prevItem.id}`, { scroll: false })
    }
  }, [currentIndex, items, queueId, router])

  const handleScoreSubmit = async (
    scores: Array<{ configId: string; name: string; value: number }>,
    comment: string
  ) => {
    const currentItem = items[currentIndex]
    if (!currentItem) {
      console.error("No item found at current index")
      return
    }

    setIsSubmitting(true)

    try {
      // Queue all scores (doesn't send yet)
      scores.forEach(score => {
        // Find the config for this score to get dataType and stringValue
        const config = scoreConfigs.find(c => c.id === score.configId)

        // For categorical scores, find the label (stringValue) for the selected value
        let stringValue: string | undefined
        if (config?.dataType === "CATEGORICAL") {
          if (config.categories) {
            const category = config.categories.find(cat => cat.value === score.value)
            stringValue = category?.label

            if (!stringValue) {
              console.error(`No label found for categorical score "${score.name}" with value ${score.value}`)
              throw new Error(`Invalid category value for "${score.name}"`)
            }
          } else {
            console.error(`No categories defined for categorical score "${score.name}"`)
            throw new Error(`Configuration error for "${score.name}"`)
          }
        }

        submitScore({
          name: score.name,
          value: score.value,
          comment,
          configId: score.configId,
          queueId: queueId,
          dataType: config?.dataType,
          stringValue,
          ...(currentItem.objectType === "TRACE" && { traceId: currentItem.objectId }),
          ...(currentItem.objectType === "SESSION" && { sessionId: currentItem.objectId }),
        })
      })

      // Flush all scores at once (single network request)
      await flushScores()

      // Update queue item status via our API route
      await api.updateQueueItemStatus(queueId, currentItem.id, "COMPLETED")

      // Update local state to reflect completion
      setItems(prevItems =>
        prevItems.map(item =>
          item.id === currentItem.id
            ? { ...item, status: "COMPLETED", completedAt: new Date().toISOString() }
            : item
        )
      )

      // Reset submitting state before navigation
      setIsSubmitting(false)

      // Auto advance to next item
      // The useEffect will handle fetching the next item's data
      handleNext()
    } catch (error) {
      console.error("Error submitting scores:", error)
      alert("Failed to submit scores. Please try again.")
      setIsSubmitting(false)
    }
  }

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return

      if (e.key === "ArrowRight") handleNext()
      if (e.key === "ArrowLeft") handlePrev()
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [handleNext, handlePrev])

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading queue...</div>
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="h-screen flex flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">No items in this queue.</p>
        <Button asChild variant="outline">
          <Link href="/">Back to Dashboard</Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      {/* Header */}
      <header className="h-14 border-b flex items-center justify-between px-4 bg-card/50 backdrop-blur-sm shrink-0 z-10">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild className="h-8 w-8">
            <Link href="/">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div className="flex flex-col">
            <span className="text-sm font-medium">Queue #{queueId}</span>
            <span className="text-xs text-muted-foreground">
              Item {currentIndex + 1} of {items.length}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="text-xs text-muted-foreground mr-4 hidden md:block">
            <span className="bg-muted px-1.5 py-0.5 rounded border border-border/50">←</span> Prev
            <span className="mx-2"></span>
            <span className="bg-muted px-1.5 py-0.5 rounded border border-border/50">→</span> Next
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handlePrev}
            disabled={currentIndex === 0}
            className="h-8 w-8 p-0 bg-transparent"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleNext}
            disabled={currentIndex === items.length - 1}
            className="h-8 w-8 p-0 bg-transparent"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex overflow-hidden">
        {/* Chat Area */}
        <div className="flex-1 overflow-y-auto p-4 md:p-8 scroll-smooth">
          <div className="max-w-3xl mx-auto space-y-6 pb-20">
            {loadingItem ? (
              <div className="space-y-4">
                <Skeleton className="h-12 w-3/4 ml-auto rounded-xl" />
                <Skeleton className="h-24 w-2/3 rounded-xl" />
                <Skeleton className="h-12 w-1/2 ml-auto rounded-xl" />
              </div>
            ) : (
              currentData?.messages.map((msg, idx) => (
                <ChatBubble key={idx} role={msg.role} content={msg.content} timestamp={msg.timestamp} />
              ))
            )}

            {!loadingItem && currentData?.messages.length === 0 && (
              <div className="text-center text-muted-foreground py-20">No messages found for this trace.</div>
            )}
          </div>
        </div>

        {/* Sidebar / Scoring Panel */}
        <div className="w-80 border-l bg-card/30 backdrop-blur-sm p-4 overflow-y-auto shrink-0 hidden md:block">
          <ScorePanel
            key={items[currentIndex]?.id || currentIndex}
            scoreConfigs={scoreConfigs}
            onSubmit={handleScoreSubmit}
            isSubmitting={isSubmitting}
            isCompleted={items[currentIndex]?.status === "COMPLETED"}
            completedAt={items[currentIndex]?.completedAt}
            existingScores={currentData?.scores}
          />

          <div className="mt-8 space-y-4">
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Metadata</h4>
            <div className="text-xs space-y-2 text-muted-foreground/80">
              <div className="flex justify-between">
                <span>ID</span>
                <span className="font-mono text-foreground">{items[currentIndex]?.id}</span>
              </div>
              <div className="flex justify-between">
                <span>Status</span>
                <span
                  className={cn(
                    "px-1.5 py-0.5 rounded text-[10px] font-medium",
                    items[currentIndex]?.status === "COMPLETED"
                      ? "bg-green-500/10 text-green-500"
                      : "bg-yellow-500/10 text-yellow-500",
                  )}
                >
                  {items[currentIndex]?.status}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Created</span>
                <span>{new Date(items[currentIndex]?.createdAt).toLocaleDateString()}</span>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
