"use client";

import type { ReactNode } from "react";
import { useIsOwner } from "./OwnerTools";

/** Shows its children only to the agent's owner (the connected holdfast wallet). */
export function OwnerOnly({ owner, children }: { owner: string; children: ReactNode }) {
  return useIsOwner(owner) ? <>{children}</> : null;
}
