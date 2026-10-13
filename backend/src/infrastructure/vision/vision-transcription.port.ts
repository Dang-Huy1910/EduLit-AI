export type VisionPageInput = { pageId: string; mimeType: string; data: Buffer; contentHash: string };
export type VisionTranscriptionRequest = { systemInstruction: string; userPayload: string; responseJsonSchema: Record<string, unknown>; promptVersion: string; pages: VisionPageInput[] };
export type VisionSegment = { id: string; text: string; needsReview: boolean; reason?: string };
export type VisionTranscriptionOutput = { pages: Array<{ pageId: string; segments: VisionSegment[] }> };
export type VisionTranscriptionSuccess = { output: VisionTranscriptionOutput; rawText: string; finishReason: string; latencyMs: number; provider: "gemini" | "openai" | "mock"; model: string; promptVersion: string };
export interface VisionTranscriptionPort { transcribe(request: VisionTranscriptionRequest, signal?: AbortSignal): Promise<VisionTranscriptionSuccess>; }
