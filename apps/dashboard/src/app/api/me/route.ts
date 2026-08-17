import { NextResponse } from "next/server";
import { requireWebActor } from "@/lib/web-auth";

export async function GET(request: Request) {
  const auth = await requireWebActor(request);
  if (!auth.ok) return auth.response;
  return NextResponse.json({
    userId: auth.actor.userId,
    email: auth.actor.email,
    role: auth.actor.role,
    roles: [auth.actor.role],
  });
}
