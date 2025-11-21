import { GoogleGenAI, Type } from "@google/genai";
import { ModerationResult } from "../types";

// Initialize Gemini
// Note: Expects process.env.API_KEY to be injected by the environment/sandbox
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const fileToGenerativePart = async (file: File): Promise<{ inlineData: { data: string; mimeType: string } }> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = (reader.result as string).split(',')[1];
      resolve({
        inlineData: {
          data: base64String,
          mimeType: file.type,
        },
      });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

export const analyzeMediaSafety = async (file: File): Promise<ModerationResult> => {
  try {
    const mediaPart = await fileToGenerativePart(file);
    
    const prompt = `
      You are a content moderator for a public digital billboard company.
      Analyze the provided image or video frame.
      Determine if this content is safe for general public display (all ages).
      
      Strictly prohibited:
      - Nudity or sexual content
      - Excessive violence or gore
      - Hate symbols or hate speech
      - Illegal drugs
      
      Return JSON with:
      - safe: boolean
      - reason: string (short explanation)
    `;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: {
        parts: [mediaPart, { text: prompt }],
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
            type: Type.OBJECT,
            properties: {
                safe: { type: Type.BOOLEAN },
                reason: { type: Type.STRING }
            },
            required: ["safe", "reason"]
        }
      },
    });

    const text = response.text;
    if (!text) throw new Error("No response from AI");

    const result = JSON.parse(text) as ModerationResult;
    return result;

  } catch (error) {
    console.error("Gemini Analysis Error:", error);
    // Default to unsafe if analysis fails to be conservative
    return { safe: false, reason: "AI Analysis failed. Please try again." };
  }
};