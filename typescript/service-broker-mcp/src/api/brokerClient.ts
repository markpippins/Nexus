/**
 * BrokerClient — HTTP client for the service-broker backend.
 *
 * All requests go through POST /api/v1/broker/submitRequest with a
 * ServiceRequest body: { service, operation, params, requestId }.
 */

import { randomUUID } from "crypto";

const BROKER_URL =
  process.env.BROKER_URL || "http://localhost:8081/api/v1/broker/submitRequest";

interface ServiceRequest {
  service: string;
  operation: string;
  params: Record<string, unknown>;
  requestId: string;
}

interface ServiceResponseBody {
  ok: boolean;
  data: Record<string, unknown>;
  errors: string[];
  requestId: string;
  ts: string;
  version: string;
  service: string;
  operation: string;
}

/**
 * Submit a request to the service-broker.
 */
export async function submitRequest(
  service: string,
  operation: string,
  params: Record<string, unknown>
): Promise<ServiceResponseBody> {
  const request: ServiceRequest = {
    service,
    operation,
    params,
    requestId: randomUUID(),
  };

  const resp = await fetch(BROKER_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });

  const body = await resp.json();

  // The broker returns ServiceResponseBody directly
  return body as ServiceResponseBody;
}

// ═══════════════════════════════════════════════════════════════════
//  LOGIN
// ═══════════════════════════════════════════════════════════════════

export interface LoginResult {
  ok: boolean;
  token?: string;
  userId?: string;
  admin?: boolean;
  status?: string;
  message?: string;
  errors?: Record<string, string>;
}

/**
 * Login via the service-broker.
 *
 * The broker expects `identifier` (not `password`) as the param key —
 * this matches LoginService.login(@BrokerParam("identifier") String password).
 */
export async function login(
  email: string,
  password: string
): Promise<LoginResult> {
  const resp = await submitRequest("loginService", "login", {
    email,
    identifier: password,
  });

  if (!resp.ok) {
    return {
      ok: false,
      status: "FAILURE",
      message: (resp.data?.message as string) || "Login failed",
      errors: resp.data?.errors as Record<string, string>,
    };
  }

  return {
    ok: true,
    token: resp.data?.token as string,
    userId: resp.data?.userId as string,
    admin: resp.data?.admin as boolean,
    status: resp.data?.status as string,
  };
}

// ═══════════════════════════════════════════════════════════════════
//  TOKEN VALIDATION
// ═══════════════════════════════════════════════════════════════════

export interface TokenCheckResult {
  ok: boolean;
  loggedIn?: boolean;
  userId?: string;
  admin?: boolean;
  message?: string;
}

/**
 * Check if a token is still valid (logged in).
 *
 * The broker returns `data: true` or `data: false` (a boolean), not an object.
 */
export async function isLoggedIn(token: string): Promise<TokenCheckResult> {
  const resp = await submitRequest("loginService", "isLoggedIn", { token });

  // data is a boolean directly, not an object
  const loggedIn = typeof resp.data === "boolean" ? resp.data : resp.data?.loggedIn as boolean;

  return {
    ok: resp.ok,
    loggedIn,
    userId: resp.data?.userId as string | undefined,
    admin: resp.data?.admin as boolean | undefined,
    message: resp.data?.message as string | undefined,
  };
}

// ═══════════════════════════════════════════════════════════════════
//  LOGOUT
// ═══════════════════════════════════════════════════════════════════

export interface LogoutResult {
  ok: boolean;
  message?: string;
}

/**
 * Logout (invalidate token).
 */
export async function logout(token: string): Promise<LogoutResult> {
  const resp = await submitRequest("loginService", "logout", { token });

  return {
    ok: resp.ok,
    message: resp.data?.message as string,
  };
}
