/**
 * Onboarding Lottie animation — the Qiubit icon bouncing in, surrounded by
 * floating chain tokens (ETH, SOL, BTC, SUI, OCT) and the wallet buddy.
 *
 * Source of truth lives in scripts/lottie/generate-lottie.mjs; regenerate with
 * `node scripts/lottie/generate-lottie.mjs` (it rewrites the JSON asset here).
 *
 * The intro segment (frames 0–60) plays once, then the seamless loop segment
 * (frames 60–240) repeats forever. The player (lottie_light, SVG renderer
 * only) is loaded lazily so it stays out of the main bundle.
 */

import { useEffect, useRef } from "react";
import animationData from "../../assets/lottie/qiubit-onboarding.json";

const INTRO_END = 60;
const LAST_FRAME = 240;

interface OnboardingLottieProps {
  size?: number;
}

export function OnboardingLottie({ size = 260 }: OnboardingLottieProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let anim: { destroy: () => void } | undefined;
    let cancelled = false;

    import("lottie-web/build/player/lottie_light")
      .then(({ default: lottie }) => {
        if (cancelled || !containerRef.current) return;
        const instance = lottie.loadAnimation({
          container: containerRef.current,
          renderer: "svg",
          loop: true,
          autoplay: false,
          animationData: animationData as unknown as object,
        });
        instance.playSegments(
          [
            [0, INTRO_END],
            [INTRO_END, LAST_FRAME],
          ],
          true,
        );
        anim = instance;
      })
      .catch((err) => {
        console.error("Failed to load onboarding animation:", err);
      });

    return () => {
      cancelled = true;
      anim?.destroy();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="onboarding-lottie"
      style={{ width: size, height: size }}
      aria-hidden="true"
    />
  );
}
