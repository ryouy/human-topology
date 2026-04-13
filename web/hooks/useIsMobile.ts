"use client";

import { useSyncExternalStore } from "react";

/** 狭い画面・低い高さ（ランドスケープ端末）をスマホ扱い */
const QUERY = "(max-width: 768px), (max-height: 520px)";

function subscribe(onChange: () => void) {
  const mq = window.matchMedia(QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

function getSnapshot() {
  return window.matchMedia(QUERY).matches;
}

function getServerSnapshot() {
  return false;
}

export function useIsMobile() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
