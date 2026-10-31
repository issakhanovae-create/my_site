import { useEffect, useRef } from "react";

export function useReveal() {
  const ref = useRef(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const motionOk = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!motionOk || !("IntersectionObserver" in window)) {
      node.classList.add("is-in");
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-in");
            entry.target.querySelectorAll("[data-count]").forEach(runCount);
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.16 }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return ref;
}

function runCount(node) {
  const target = Number(node.dataset.count);
  if (!Number.isFinite(target)) return;
  const suffix = node.dataset.suffix || "";
  const decimal = String(node.dataset.count).includes(".");
  const startedAt = performance.now();
  const duration = 900;
  const step = (now) => {
    const progress = Math.min(1, (now - startedAt) / duration);
    const eased = 1 - (1 - progress) ** 3;
    const value = target * eased;
    const shown = decimal ? value.toFixed(1).replace(".", ",") : String(Math.round(value));
    node.textContent = shown + suffix;
    if (progress < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
