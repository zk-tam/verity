import { NextRequest, NextResponse } from 'next/server'
import backendRequest from '@/lib/server/backendRequest'
import { getAuthToken } from '@/lib/server/getAuthToken'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const tokenData = getAuthToken(request)
    const body = await request.json()
    const { token_ids } = body as { token_ids?: number[] }

    if (!Array.isArray(token_ids) || token_ids.length === 0) {
      return NextResponse.json({ error: 'token_ids must be a non-empty array' }, { status: 400 })
    }

    const response = await backendRequest(
      tokenData,
      '/buyback',
      'POST',
      undefined,
      { token_ids, collection_address: "" }
    )

    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    })
  } catch (error) {
    console.error('Batch buyback API error:', error)

    if (error instanceof Error && 'status' in error) {
      return NextResponse.json(
        { error: error.message },
        {
          status: (error as { status?: number }).status || 500,
          headers: {
            'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
          }
        }
      )
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      {
        status: 500,
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      }
    )
  }
}
