import { NextRequest, NextResponse } from 'next/server'
import backendRequest from '@/lib/server/backendRequest'
import { getAuthToken } from '@/lib/server/getAuthToken'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const tokenData = getAuthToken(request);

    // Parse request body
    const body = await request.json()
    const { gacha_machine_id, batch_roll_count = 1 } = body

    if (!gacha_machine_id) {
      return NextResponse.json({ error: 'gacha_machine_id is required' }, { status: 400 })
    }

    // Call backend API
    const response = await backendRequest(
      tokenData,
      '/roll',
      'POST',
      undefined,
      { gacha_machine_id, batch_roll_count }
    )

    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    })
  } catch (error) {
    console.error('Roll API error:', error)

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