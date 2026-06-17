import { NextRequest, NextResponse } from "next/server";
import { askAssistant } from "@/lib/assistant";

export async function POST(req: NextRequest) {
  const { question } = await req.json();
  if (!question || typeof question !== "string") {
    return NextResponse.json({ error: "question required" }, { status: 400 });
  }
  const reply = askAssistant(question);
  return NextResponse.json(reply);
}
