// This file is kept for compatibility but is no longer used
import type { NextRequest } from "next/server"

export async function GET(request: NextRequest) {
  return new Response("SSE is disabled, please use polling instead", { status: 200 })
}
