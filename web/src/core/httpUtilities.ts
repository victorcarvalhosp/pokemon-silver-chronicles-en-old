// Port of Data/Scripts/001_Technical/002_Files/003_HTTP_Utilities.rb on
// fetch (mkxp-z's HTTPLite). A browser sets Host, Content-Length and
// User-Agent itself, so only the other headers are sent; cross-origin
// servers must allow CORS. Files go through the dev server's file endpoint
// (docs/data.md), so `filename` must be under web/data or PBS.

import { sprintf } from "./intl";

/** HTTPLite's result: the status and body, or "" when the request failed. */
async function httpLite(url: string, init: RequestInit): Promise<{ status: number; body: string } | ""> {
  try {
    const res = await fetch(url, init);
    return { status: res.status, body: await res.text() };
  } catch {
    return ""; // rescue ""
  }
}

async function writeFile(filename: string, body: string): Promise<void> {
  const { DevFiles } = await import("../debug/devFiles");
  await DevFiles.write(filename, body);
}

/** Percent-encodes everything but [a-zA-Z0-9_.-], byte by byte (Ruby's /n regexp). */
function formEncode(s: string): string {
  let ret = "";
  for (const byte of new TextEncoder().encode(s)) {
    const ch = String.fromCharCode(byte);
    ret += /[a-zA-Z0-9_.-]/.test(ch) ? ch : sprintf("%%%02x", byte);
  }
  return ret;
}

export async function pbPostData(url: string, postdata: Record<string, unknown>, filename: string | null = null, _depth = 0): Promise<string> {
  // NOTE (Ruby parity): only plain http:// URLs are posted; anything else
  // (https included) returns "" (003_HTTP_Utilities.rb:7).
  if (!/^http:\/\/([^/]+)(.*)$/.test(url)) return "";
  const body = Object.entries(postdata).map(([key, value]) => `${formEncode(String(key))}=${formEncode(value == null ? "" : String(value))}`).join("&");
  const ret = await httpLite(url, {
    method: "POST",
    body,
    headers: { "Content-Type": "application/x-www-form-urlencoded", Pragma: "no-cache" },
  });
  if (ret === "") return ret;
  if (ret.status !== 200) return "";
  if (!filename) return ret.body;
  await writeFile(filename, ret.body);
  return "";
}

export async function pbDownloadData(url: string, filename: string | null = null, authorization: string | null = null, _depth = 0): Promise<string> {
  const headers: Record<string, string> = { Pragma: "no-cache" };
  if (authorization) headers.authorization = authorization;
  const ret = await httpLite(url, { headers });
  if (ret === "") return ret;
  if (ret.status !== 200) return "";
  if (!filename) return ret.body;
  await writeFile(filename, ret.body);
  return "";
}

export async function pbDownloadToString(url: string): Promise<string> {
  try {
    return await pbDownloadData(url);
  } catch {
    return "";
  }
}

export async function pbDownloadToFile(url: string, file: string): Promise<void> {
  try {
    await pbDownloadData(url, file);
  } catch { /* rescue */ }
}

export async function pbPostToString(url: string, postdata: Record<string, unknown>): Promise<string> {
  try {
    return await pbPostData(url, postdata);
  } catch {
    return "";
  }
}

export async function pbPostToFile(url: string, postdata: Record<string, unknown>, file: string): Promise<void> {
  try {
    await pbPostData(url, postdata, file);
  } catch { /* rescue */ }
}
