import crypto from "crypto";

export type ErrorCode =
  | "INVALID_ARGUMENTS"
  | "TOOL_NOT_FOUND"
  | "INTERNAL_ERROR"
  | "NOT_FOUND"
  | "FORUM_NOT_FOUND"
  | "POST_NOT_FOUND"
  | "USER_NOT_FOUND"
  | "DUPLICATE"
  | "VALIDATION_ERROR";

export interface AppError {
  error: {
    code: string;
    message: string;
    details?: any;
    requestId: string;
  };
}

export function createError(
  code: ErrorCode,
  message: string,
  details?: any,
  requestId?: string,
): AppError {
  return {
    error: {
      code,
      message,
      details,
      requestId: requestId || crypto.randomUUID(),
    },
  };
}

export function createSuccess(
  result: any,
  requestId?: string,
): { result: { isError: false; content: Array<{ type: "text"; text: string }> }; requestId: string } {
  return {
    result: {
      isError: false,
      content: [{ type: "text", text: typeof result === "string" ? result : JSON.stringify(result) }],
    },
    requestId: requestId || crypto.randomUUID(),
  };
}
