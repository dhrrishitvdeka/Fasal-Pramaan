import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SITE_LOCK_COOKIE, isSiteLockActive, isValidSiteLockToken } from "@/lib/site-lock";
import { assertNoSecretLeak, mintVoiceSession } from "@/lib/voice/gemini-session";
import { requireWebActor } from "@/lib/web-auth";

export async function POST(request: Request) {
  const auth = await requireWebActor(request);
  if (!auth.ok) return auth.response;
  const jar = await cookies();
  const unlocked = await isValidSiteLockToken(jar.get(SITE_LOCK_COOKIE)?.value);
  const result = await mintVoiceSession({
    lockActive: isSiteLockActive(),
    unlocked,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  const body = {
    token: result.token,
    model: result.model,
    websocketUrl: result.websocketUrl,
    expiresAt: result.expiresAt,
    sessionId: result.sessionId,
    outputSampleRateHz: 24000,
  };
  assertNoSecretLeak(body);
  return NextResponse.json(body);
}
