/** Error types and helpers for address-tts-mcp */

export type ErrorCode =
  | "INVALID_ARGUMENTS"
  | "TOOL_NOT_FOUND"
  | "INTERNAL_ERROR"
  | "TTS_UNREACHABLE"
  | "TTS_ERROR"
  | "NOT_FOUND";

export interface AppError {
  error: {
    code: string;
    message: string;
    details?: any;
  };
}

export function createError(
  code: ErrorCode,
  message: string,
  details?: any,
): AppError {
  return {
    error: {
      code,
      message,
      details,
    },
  };
}

export function createSuccess(result: any): { result: any } {
  return { result };
}
