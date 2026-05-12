"use client";

import { useEffect } from "react";
import { X } from "lucide-react";

type ImageLightboxProps = {
  src: string;
  alt: string;
  onClose: () => void;
};

/**
 * Fullscreen image overlay with Escape-to-close, click-outside-to-close,
 * and body scroll lock. Lifted from the original AgentRunOutput so any
 * surface that wants click-to-zoom can use it (gallery hero, gallery
 * thumbnails, future Feed cards).
 */
export function ImageLightbox({ src, alt, onClose }: ImageLightboxProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={alt}
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-8"
      style={{
        background: "rgba(5, 10, 24, 0.88)",
        backdropFilter: "blur(8px)",
      }}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close full image"
        className="absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-md text-cloud-white transition-[background-color] duration-280 ease-out-quart hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ua"
        style={{
          background: "rgba(10, 20, 40, 0.55)",
          border: "1px solid rgba(255,255,255,0.18)",
        }}
      >
        <X className="h-4 w-4" strokeWidth={2.5} />
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        onClick={(e) => e.stopPropagation()}
        className="max-h-full max-w-full cursor-default rounded-md object-contain"
        style={{
          boxShadow: "0 8px 60px rgba(0,0,0,0.6)",
        }}
      />
    </div>
  );
}
