import type { AuthSession } from "@agent-native/core/server";
import { getCookie, setCookie, deleteCookie, type H3Event } from "h3";

/**
 * One-click guest workspaces: a signed cookie names a throwaway identity, so a
 * visitor can open a seeded board and use the agent without signing up. Real
 * accounts keep using the built-in sign-in; this only adds an identity source.
 */
export const GUEST_COOKIE = "vb_guest";
const GUEST_DOMAIN = "guest.verbatim.app";
const MAX_AGE_S = 60 * 60 * 24 * 7;

function secret(): string {
  const s = process.env.GUEST_SESSION_SECRET ?? process.env.BETTER_AUTH_SECRET;
  if (s) return s;
  if (process.env.NODE_ENV === "production") throw new Error("GUEST_SESSION_SECRET is not set");
  return "verbatim-dev-guest-secret";
}

// Web Crypto keeps this portable to every Nitro host.
async function sign(value: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret()), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)));
  let bin = "";
  for (const b of mac) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function isGuestEmail(email: string | null | undefined): boolean {
  return !!email && email.endsWith(`@${GUEST_DOMAIN}`);
}

export function newGuestEmail(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return `guest-${[...bytes].map((b) => b.toString(16).padStart(2, "0")).join("")}@${GUEST_DOMAIN}`;
}

export async function setGuestCookie(event: H3Event, email: string) {
  setCookie(event, GUEST_COOKIE, `${email}.${await sign(email)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_S,
  });
}

export function clearGuestCookie(event: H3Event) {
  deleteCookie(event, GUEST_COOKIE, { path: "/" });
}

export async function readGuestEmail(event: H3Event): Promise<string | null> {
  const raw = getCookie(event, GUEST_COOKIE);
  if (!raw) return null;
  const dot = raw.lastIndexOf(".");
  if (dot <= 0) return null;
  const email = raw.slice(0, dot);
  if (!safeEqual(raw.slice(dot + 1), await sign(email))) return null;
  return isGuestEmail(email) ? email : null;
}

export async function guestSession(event: H3Event): Promise<AuthSession | null> {
  const email = await readGuestEmail(event);
  return email ? { email, name: "Guest", emailVerified: false } : null;
}
