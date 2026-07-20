import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

const models = await ai.models.list();

for await (const model of models) {
  console.log(model.name);
}