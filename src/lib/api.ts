import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { getSession, type Session } from "./auth";
import { db } from "./db";
import { Circle, User, type CircleDoc, type UserDoc } from "./models";
import { CircleError, isMember, isOrganizer } from "./circles/service";
import { PayPalError } from "./paypal/client";

export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function ok<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}

export async function readJson<T extends Record<string, unknown>>(req: Request): Promise<T> {
  try {
    const body = (await req.json()) as T;
    if (!body || typeof body !== "object") throw new Error();
    return body;
  } catch {
    throw new ApiError(400, "bad_json", "The request body must be JSON.");
  }
}

export async function requireUserApi(): Promise<{ session: Session; user: UserDoc }> {
  const session = await getSession();
  if (!session) throw new ApiError(401, "unauthenticated", "Sign in first.");
  await db();
  const user = await User.findById(session.userId).lean<UserDoc>();
  if (!user) throw new ApiError(401, "unauthenticated", "Sign in first.");
  return { session, user };
}

export async function loadCircleForMember(id: string, userId: string): Promise<CircleDoc> {
  if (!mongoose.isValidObjectId(id)) throw new ApiError(404, "not_found", "Circle not found.");
  await db();
  const circle = await Circle.findById(id).lean<CircleDoc>();
  if (!circle) throw new ApiError(404, "not_found", "Circle not found.");
  if (!isMember(circle, userId)) throw new ApiError(403, "forbidden", "You are not a member of this circle.");
  return circle;
}

export async function loadCircleForOrganizer(id: string, userId: string): Promise<CircleDoc> {
  const circle = await loadCircleForMember(id, userId);
  if (!isOrganizer(circle, userId)) throw new ApiError(403, "forbidden", "Only the organizer can do this.");
  return circle;
}

/** Wraps a handler so every error becomes a JSON answer with a code the UI can translate. */
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<NextResponse>) {
  return async (...args: A): Promise<NextResponse> => {
    try {
      return await fn(...args);
    } catch (error) {
      if (error instanceof ApiError) {
        return NextResponse.json({ error: error.code, message: error.message }, { status: error.status });
      }
      if (error instanceof CircleError) {
        return NextResponse.json({ error: error.code, message: error.message }, { status: 400 });
      }
      if (error instanceof PayPalError) {
        console.error("PayPal error", error.endpoint, error.status, error.body);
        return NextResponse.json(
          { error: "paypal", message: `PayPal refused the request (${error.status}). Check the sandbox credentials and try again.` },
          { status: 502 },
        );
      }
      console.error(error);
      return NextResponse.json(
        { error: "internal", message: (error as Error).message || "Something went wrong." },
        { status: 500 },
      );
    }
  };
}
