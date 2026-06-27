"use client";

import { useState, useEffect } from "react";
import { doc, getDoc, onSnapshot } from "firebase/firestore";
import { onAuthChange, type User } from "@/lib/firebase-auth";
import { db } from "@/lib/firebase";

export type AuthRole = "admin" | "user" | "super_admin";

export interface AuthUser extends User {
  role: AuthRole;
  featureOverrides?: Record<string, boolean>;
}

async function fetchRole(uid: string): Promise<AuthRole> {
  // Check new `users` collection first, then legacy `user` collection
  try {
    const newDocSnap = await getDoc(doc(db, "users", uid));
    if (newDocSnap.exists()) {
      const role = newDocSnap.data().role;
      console.log("[useAuth] fetchRole:", uid, "role:", role);
      return (role as AuthRole) || "user";
    }
    const legacyDoc = await getDoc(doc(db, "user", uid));
    if (legacyDoc.exists()) {
      const role = legacyDoc.data().role;
      console.log("[useAuth] fetchRole (legacy):", uid, "role:", role);
      return (role as AuthRole) || "user";
    }
    console.warn("[useAuth] No user doc found for:", uid);
  } catch (err) {
    console.error("[useAuth] fetchRole error:", err);
  }
  return "user";
}

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubFirestore: (() => void) | null = null;

    const unsubAuth = onAuthChange((firebaseUser) => {
      if (unsubFirestore) { unsubFirestore(); unsubFirestore = null; }

      if (firebaseUser) {
        // Listen for real-time role changes from Firestore
        unsubFirestore = onSnapshot(doc(db, "users", firebaseUser.uid), (snap) => {
          const data = snap.exists() ? snap.data() : {};
          const role: AuthRole = (data.role as AuthRole) || "user";
          const featureOverrides = (data.featureOverrides as Record<string, boolean>) || {};
          setUser({ ...firebaseUser, role, featureOverrides } as AuthUser);
          setLoading(false);
        }, (err) => {
          console.error("[useAuth] onSnapshot error:", err);
          // Fallback: try one-time read
          fetchRole(firebaseUser.uid).then((role) => {
            setUser({ ...firebaseUser, role } as AuthUser);
            setLoading(false);
          });
        });
      } else {
        setUser(null);
        setLoading(false);
      }
    });

    return () => {
      unsubAuth();
      if (unsubFirestore) unsubFirestore();
    };
  }, []);

  return {
    user,
    loading,
    isAuthenticated: !!user,
    role: user?.role ?? ("user" as AuthRole),
    featureOverrides: user?.featureOverrides ?? {},
  };
}
