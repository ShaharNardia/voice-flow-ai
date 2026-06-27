"use client";

import { useEffect, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "./useAuth";

export interface UserInfo {
  uid: string;
  email: string;
  displayName?: string;
}

/**
 * Loads all users into a Map<uid, UserInfo> for super_admin visibility.
 * Returns an empty Map for non-super-admin users.
 * Cached in component state — fetches once per mount.
 */
export function useUsersMap() {
  const { role } = useAuth();
  const [usersMap, setUsersMap] = useState<Map<string, UserInfo>>(new Map());
  const [loading, setLoading] = useState(false);

  const isSuperAdmin = role === "super_admin";

  useEffect(() => {
    if (!isSuperAdmin) {
      setUsersMap(new Map());
      return;
    }
    setLoading(true);
    getDocs(collection(db, "users"))
      .then((snap) => {
        const map = new Map<string, UserInfo>();
        snap.docs.forEach((d) => {
          const data = d.data();
          map.set(d.id, {
            uid: d.id,
            email: data.email || "",
            displayName: data.displayName || "",
          });
        });
        setUsersMap(map);
      })
      .catch(() => setUsersMap(new Map()))
      .finally(() => setLoading(false));
  }, [isSuperAdmin]);

  return { usersMap, loading, isSuperAdmin };
}
