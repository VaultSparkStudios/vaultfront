import type { RequestHandler } from "express";

/**
 * Explicit tombstone for a removed mutation contract. The route-policy audit
 * recognizes this marker as non-mutating retirement, while old clients get a
 * deterministic upgrade signal instead of a misleading success.
 */
export function retiredMutation(message: string): RequestHandler {
  return (_req, res) => res.status(410).json({ error: message });
}
