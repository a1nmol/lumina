// Client-side Web Push helpers. Plain module (no "use client" needed — it
// exports functions only, no components), shared by anything that needs to
// subscribe a browser to push notifications.

/**
 * Converts a URL-safe base64 VAPID public key into the Uint8Array
 * PushManager.subscribe expects. Returns a plain ArrayBuffer-backed
 * Uint8Array (not Uint8Array<ArrayBufferLike>) — TypeScript's DOM lib types
 * PushSubscriptionOptionsInit.applicationServerKey as BufferSource, which
 * excludes the wider ArrayBufferLike generic newer @types/node infers for
 * `new Uint8Array(n)` in some TS/lib combinations.
 */
export function urlBase64ToUint8Array(base64Url: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64Url.length % 4)) % 4)
  const base64 = (base64Url + padding).replace(/-/g, "+").replace(/_/g, "/")
  const raw = window.atob(base64)
  const output = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) {
    output[i] = raw.charCodeAt(i)
  }
  return output
}
