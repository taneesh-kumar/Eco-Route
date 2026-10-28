"use client";

import React, { useEffect, useRef } from "react";
import {
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Info,
  X,
} from "lucide-react";

export interface StatusNotification {
  type: "success" | "warning" | "error" | "info";
  title: string;
  message: string;
}

export interface StatusNotificationBannerProps {
  notification: StatusNotification | null;
  onDismiss: () => void;
  autoDismissMs?: number;
}

export function StatusNotificationBanner({
  notification,
  onDismiss,
  autoDismissMs = 7000,
}: StatusNotificationBannerProps) {
  // Store the latest onDismiss callback in a ref to avoid resetting the timer on unrelated parent re-renders
  const onDismissRef = useRef(onDismiss);
  useEffect(() => {
    onDismissRef.current = onDismiss;
  });

  useEffect(() => {
    if (!notification || autoDismissMs <= 0) return;
    const timer = setTimeout(() => {
      onDismissRef.current();
    }, autoDismissMs);
    return () => clearTimeout(timer);
  }, [notification, autoDismissMs]);

  if (!notification) return null;

  const styleMap = {
    success: {
      wrapper: "bg-emerald-950/40 border-emerald-500/40 text-emerald-200 shadow-emerald-950/20",
      icon: <CheckCircle2 className="w-5 h-5 text-[#22c55e]" />,
      badge: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30",
    },
    warning: {
      wrapper: "bg-amber-950/40 border-amber-500/40 text-amber-200 shadow-amber-950/20",
      icon: <AlertTriangle className="w-5 h-5 text-amber-400" />,
      badge: "text-amber-400 bg-amber-500/10 border-amber-500/30",
    },
    error: {
      wrapper: "bg-rose-950/40 border-rose-500/40 text-rose-200 shadow-rose-950/20",
      icon: <AlertCircle className="w-5 h-5 text-rose-400" />,
      badge: "text-rose-400 bg-rose-500/10 border-rose-500/30",
    },
    info: {
      wrapper: "bg-cyan-950/40 border-cyan-500/40 text-cyan-200 shadow-cyan-950/20",
      icon: <Info className="w-5 h-5 text-cyan-400" />,
      badge: "text-cyan-400 bg-cyan-500/10 border-cyan-500/30",
    },
  };

  const currentStyle = styleMap[notification.type] || styleMap.info;

  return (
    <div
      role="alert"
      aria-live="polite"
      className={`p-4 rounded-2xl border flex items-start justify-between gap-3 shadow-lg transition-all animate-in fade-in slide-in-from-top-2 duration-200 ${currentStyle.wrapper}`}
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 shrink-0">{currentStyle.icon}</div>
        <div>
          <div className="text-xs font-bold font-mono uppercase tracking-wider">
            {notification.title}
          </div>
          <p className="text-xs mt-0.5 leading-relaxed opacity-95">
            {notification.message}
          </p>
        </div>
      </div>

      <button
        onClick={onDismiss}
        className="p-1 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition cursor-pointer shrink-0 focus:outline-none focus:ring-2 focus:ring-white/20"
        aria-label="Dismiss notification"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
