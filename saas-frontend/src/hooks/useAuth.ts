"use client";

import { useState, useEffect } from "react";
import { doc, getDoc } from "firebase/firestore";
import { onAuthChange, type User } from "@/lib/firebase-auth";
import { db } from "@/lib/firebase";

export type AuthRole = "admin" | "user";

export interface AuthUser extends User {
  role: AuthRole;
}

async function fetchRole(uid: string): Promise<AuthRole> {
  // Check new `users` collection first, then legacy `user` collection
  try {
    const newDoc = await getDoc(doc(db, "users", uid));
    if (newDoc.exists()) return (newDoc.data().role as AuthRole) || "user";
    const legacyDoc = await getDoc(doc(db, "user", uid));
    if (legacyDoc.exists()) return (legacyDoc.data().role as AuthRole) || "user";
  } catch { /* proceed with default */ }
  return "user";
}

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthChange(async (firebaseUser) => {
      if (firebaseUser) {
        const role = await fetchRole(firebaseUser.uid);
        setUser({ ...firebaseUser, role } as AuthUser);
      } else {
        setUser(null);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  return { user, loading, isAuthenticated: !!user, role: user?.role ?? ("user" as AuthRole) };
}
