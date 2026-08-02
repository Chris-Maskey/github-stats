import type { Narrator } from './types.ts'

// The only file that knows the provider: swapping narrators is a one-file change.
const MODEL = 'gemini-2.5-flash'
const API = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`

interface RawResponse {
  candidates?: { content?: { parts?: { text?: string }[] } }[]
}

export const geminiNarrator: Narrator = async (prompt) => {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set')
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
  })
  if (!res.ok) throw new Error(`Gemini API ${res.status} ${res.statusText}`)
  const body = (await res.json()) as RawResponse
  const text = body.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) throw new Error('Gemini returned no text')
  return text
}
