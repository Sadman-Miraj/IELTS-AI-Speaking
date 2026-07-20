import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

export async function POST(request) {
  try {
    const body = await request.json();

    // Convert your frontend request into a single prompt
    const systemPrompt = body.system || "";

    const messages = (body.messages || [])
      .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
      .join("\n\n");

    const prompt = `${systemPrompt}\n\n${messages}`;

    const result = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
    });

    const text = result.text || "";

    // Return in Anthropic-compatible format
    return NextResponse.json({
      content: [
        {
          text: text,
        },
      ],
    });

  } catch (error) {
    console.error("Gemini Error:", error);

    return NextResponse.json(
      {
        error: {
          message: error.message || "Unknown error",
        },
      },
      { status: 500 }
    );
  }
}