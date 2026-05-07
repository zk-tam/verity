import backendRequest from "@/lib/server/backendRequest";
import { getAuthToken } from "@/lib/server/getAuthToken";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const tokenData = getAuthToken(request);
    if (!tokenData) {
      return NextResponse.json(
        { error: "UNAUTHORIZED" },
        {
          status: 401,
          headers: {
            'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
          }
        }
      )
    }

    const response = await backendRequest(tokenData, '/waitlist/me', 'GET')

    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    })
  } catch (error) {
    console.error('Waitlist status API error:', error)

    if (error instanceof Error) {
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

export async function POST(request: NextRequest) {
  try {
    const tokenData = getAuthToken(request);
    if (!tokenData) {
      return NextResponse.json(
        { error: "UNAUTHORIZED" },
        {
          status: 401,
          headers: {
            'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
          }
        }
      )
    }

    // Parse request body
    const body = await request.json()
    const { x_handle, email_address } = body

    // Call backend API
    const response = await backendRequest(
      tokenData,
      '/waitlist',
      'POST',
      undefined,
      { xHandle: x_handle, email: email_address }
    )

    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    })
  } catch (error) {
    console.error('Waitlists API error:', error)

    console.log(({error}));

    if (error instanceof Error) {
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
