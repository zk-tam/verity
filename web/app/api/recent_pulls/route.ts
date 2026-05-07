import { NextRequest, NextResponse } from "next/server";
import backendRequest from "@/lib/server/backendRequest";
import { getAuthToken } from "@/lib/server/getAuthToken";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const tokenData = getAuthToken(request);

    if (!tokenData) {
      return NextResponse.json({ error: "Invalid token" }, { 
        status: 401,
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      });
    }
    // Make request to backend API
    const response = await backendRequest(tokenData, "/recent_pulls", "GET");

    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    });
  } catch (error) {
    console.error("Recent pulls API error:", error);

    if (error instanceof Error && "status" in error) {
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
      );
    }

    return NextResponse.json(
      { error: "Internal server error" },
      { 
        status: 500,
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      }
    );
  }
}
