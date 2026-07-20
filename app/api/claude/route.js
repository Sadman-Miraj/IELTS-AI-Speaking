import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

export async function POST(request) {
  try {
    const body = await request.json();

    const systemPrompt = body.system || "";

    const messages = (body.messages || [])
      .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
      .join("\n\n");

    const prompt = `${systemPrompt}\n\n${messages}`;

    const result = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
    });

    return NextResponse.json({
      content: [
        {
          text: result.text,
        },
      ],
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        error: {
          message: error.message,
        },
      },
      { status: 500 }
    );
  }
}