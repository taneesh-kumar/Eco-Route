"use client";

import { useEffect, useState, useRef } from "react";

export function ReticleCursor() {
  const [targetPos, setTargetPos] = useState({ x: -100, y: -100 });
  const [currentPos, setCurrentPos] = useState({ x: -100, y: -100 });
  const [isPointer, setIsPointer] = useState(false);
  const [isClicking, setIsClicking] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const animFrameRef = useRef<number | null>(null);

  useEffect(() => {
    // Only render on desktop / pointer-capable devices
    if (typeof window === "undefined" || !window.matchMedia("(pointer: fine)").matches) {
      return;
    }

    let mouseX = -100;
    let mouseY = -100;

    const handleMouseMove = (e: MouseEvent) => {
      mouseX = e.clientX;
      mouseY = e.clientY;
      setTargetPos({ x: mouseX, y: mouseY });
      if (!isVisible) setIsVisible(true);

      const target = e.target as HTMLElement | null;
      if (target) {
        const isClickable =
          target.tagName === "BUTTON" ||
          target.tagName === "A" ||
          target.tagName === "INPUT" ||
          target.tagName === "SELECT" ||
          target.closest("button") ||
          target.closest("a") ||
          target.closest(".cursor-pointer") ||
          target.classList.contains("cursor-pointer");
        setIsPointer(Boolean(isClickable));
      }
    };

    const handleMouseDown = () => setIsClicking(true);
    const handleMouseUp = () => setIsClicking(false);
    const handleMouseLeave = () => setIsVisible(false);
    const handleMouseEnter = () => setIsVisible(true);

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mousedown", handleMouseDown);
    window.addEventListener("mouseup", handleMouseUp);
    document.addEventListener("mouseleave", handleMouseLeave);
    document.addEventListener("mouseenter", handleMouseEnter);

    // Smooth inertia interpolation loop
    let curX = -100;
    let curY = -100;

    const loop = () => {
      curX += (mouseX - curX) * 0.18;
      curY += (mouseY - curY) * 0.18;
      setCurrentPos({ x: curX, y: curY });
      animFrameRef.current = requestAnimationFrame(loop);
    };

    animFrameRef.current = requestAnimationFrame(loop);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("mouseup", handleMouseUp);
      document.removeEventListener("mouseleave", handleMouseLeave);
      document.removeEventListener("mouseenter", handleMouseEnter);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [isVisible]);

  if (!isVisible) return null;

  return (
    <>
      {/* 1. Trailing Inertia Outer Ring */}
      <div
        className="fixed pointer-events-none z-50 transition-opacity duration-200 hidden md:block will-change-transform"
        style={{
          transform: `translate3d(${currentPos.x}px, ${currentPos.y}px, 0)`,
          left: -16,
          top: -16,
        }}
      >
        <div
          className={`w-8 h-8 rounded-full border transition-all duration-300 ease-out flex items-center justify-center ${
            isClicking
              ? "scale-75 border-[#22c55e] bg-emerald-500/20 shadow-[0_0_20px_rgba(34,197,94,0.6)]"
              : isPointer
              ? "scale-125 border-[#22c55e] bg-emerald-500/10 shadow-[0_0_16px_rgba(34,197,94,0.4)] rotate-45"
              : "scale-100 border-white/20 bg-transparent"
          }`}
        >
          {/* Reticle Crosshair corners */}
          {isPointer && (
            <div className="w-full h-full relative">
              <span className="absolute top-0 left-1/2 -translate-x-1/2 w-0.5 h-1 bg-[#22c55e]" />
              <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-0.5 h-1 bg-[#22c55e]" />
              <span className="absolute left-0 top-1/2 -translate-y-1/2 h-0.5 w-1 bg-[#22c55e]" />
              <span className="absolute right-0 top-1/2 -translate-y-1/2 h-0.5 w-1 bg-[#22c55e]" />
            </div>
          )}
        </div>
      </div>

      {/* 2. Instant Sharp Center Core Pointer */}
      <div
        className="fixed pointer-events-none z-50 hidden md:block will-change-transform"
        style={{
          transform: `translate3d(${targetPos.x}px, ${targetPos.y}px, 0)`,
          left: -2,
          top: -2,
        }}
      >
        <div
          className={`w-1 h-1 rounded-full transition-all duration-150 ${
            isPointer
              ? "bg-[#22c55e] scale-150 shadow-[0_0_8px_#22c55e]"
              : "bg-cyan-300 scale-100"
          }`}
        />
      </div>
    </>
  );
}
