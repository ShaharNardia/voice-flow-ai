"use client";

import React from "react";
import { User } from "lucide-react";
import type { UserInfo } from "@/hooks/useUsersMap";

interface OwnerBadgeProps {
  ownerId?: string | null;
  usersMap: Map<string, UserInfo>;
  className?: string;
}

/**
 * Displays a small pill with the owner's email.
 * Only renders when a valid ownerId + users map are provided.
 * Used by super_admin list pages to show who owns each record.
 */
export default function OwnerBadge({ ownerId, usersMap, className = "" }: OwnerBadgeProps) {
  if (!ownerId) {
    return (
      <span className={`inline-flex items-center gap-1 text-[10px] text-neutral-400 bg-neutral-50 border border-neutral-200 rounded-full px-1.5 py-0.5 ${className}`}>
        <User className="w-2.5 h-2.5" />
        <span className="font-mono">unowned</span>
      </span>
    );
  }

  const user = usersMap.get(ownerId);
  const label = user?.email || user?.displayName || `${ownerId.slice(0, 8)}...`;

  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] text-purple-700 bg-purple-50 border border-purple-200 rounded-full px-1.5 py-0.5 ${className}`}
      title={user?.email || ownerId}
    >
      <User className="w-2.5 h-2.5" />
      <span className="truncate max-w-[120px]">{label}</span>
    </span>
  );
}
