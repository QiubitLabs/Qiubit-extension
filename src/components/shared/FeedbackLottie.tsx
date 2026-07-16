/**
 * Transaction-feedback Lottie animations (pure shapes, a few KB each).
 *
 * Source of truth: scripts/lottie/generate-feedback.mjs — regenerating it
 * rewrites the JSON assets here. One-shot kinds play once and hold the last
 * frame; "pending" loops seamlessly. The player (lottie_light) is loaded
 * lazily and shared with the onboarding animation chunk.
 */

import { useEffect, useRef } from "react";
import successData from "../../assets/lottie/success-check.json";
import sentData from "../../assets/lottie/tx-sent.json";
import failedData from "../../assets/lottie/tx-failed.json";
import swapData from "../../assets/lottie/swap-success.json";
import pendingData from "../../assets/lottie/tx-pending.json";
import emptyData from "../../assets/lottie/empty-buddy.json";
import connectData from "../../assets/lottie/dapp-connect.json";

const ANIMATIONS = {
  success: { data: successData, loop: false },
  sent: { data: sentData, loop: false },
  failed: { data: failedData, loop: false },
  swap: { data: swapData, loop: false },
  pending: { data: pendingData, loop: true },
  empty: { data: emptyData, loop: true },
  connect: { data: connectData, loop: true },
} as const;

export type FeedbackKind = keyof typeof ANIMATIONS;

interface FeedbackLottieProps {
  kind: FeedbackKind;
  size?: number;
}

export function FeedbackLottie({ kind, size = 110 }: FeedbackLottieProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let anim: { destroy: () => void } | undefined;
    let cancelled = false;
    const { data, loop } = ANIMATIONS[kind];

    import("lottie-web/build/player/lottie_light")
      .then(({ default: lottie }) => {
        if (cancelled || !containerRef.current) return;
        containerRef.current.innerHTML = "";
        anim = lottie.loadAnimation({
          container: containerRef.current,
          renderer: "svg",
          loop,
          autoplay: true,
          animationData: data as unknown as object,
        });
      })
      .catch((err) => {
        console.error("Failed to load feedback animation:", err);
      });

    return () => {
      cancelled = true;
      anim?.destroy();
    };
  }, [kind]);

  return (
    <div
      ref={containerRef}
      style={{ width: size, height: size }}
      aria-hidden="true"
    />
  );
}
