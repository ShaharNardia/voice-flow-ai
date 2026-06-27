"use client";
import { createContext } from "react";
export const EdgeDeleteContext = createContext<(id: string) => void>(() => {});
