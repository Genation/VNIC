import { AccessToken } from 'livekit-server-sdk';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const roomName = body.roomName || 'edu-room';
  const userId = body.participantIdentity || `student-${Date.now()}`;

  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;

  if (!apiKey || !apiSecret) {
    return NextResponse.json({ error: 'Missing credentials' }, { status: 500 });
  }

  const token = new AccessToken(apiKey, apiSecret, {
    identity: userId,
    ttl: '3h',
  });

  token.addGrant({ roomJoin: true, room: roomName });

  const jwt = await token.toJwt();
  return NextResponse.json({
    token: jwt,
    serverUrl: process.env.LIVEKIT_URL || process.env.NEXT_PUBLIC_LIVEKIT_URL,
    participantToken: jwt,
  });
}
