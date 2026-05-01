import { useEffect, useState } from "react";
import { ArrowUp } from "lucide-react";

export default function ScrollToTop({ scrollerSelector = null }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const el = scrollerSelector ? document.querySelector(scrollerSelector) : window;
    const onScroll = () => {
      const y = el === window ? window.scrollY : el?.scrollTop ?? 0;
      setShow(y > 500);
    };
    onScroll();
    if (el === window) {
      window.addEventListener("scroll", onScroll, { passive: true });
      return () => window.removeEventListener("scroll", onScroll);
    }
    el?.addEventListener("scroll", onScroll, { passive: true });
    return () => el?.removeEventListener("scroll", onScroll);
  }, [scrollerSelector]);

  if (!show) return null;

  const handleClick = () => {
    if (scrollerSelector) {
      document.querySelector(scrollerSelector)?.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  return (
    <button
      onClick={handleClick}
      aria-label="Voltar ao topo"
      className="fixed bottom-24 right-6 z-30 w-10 h-10 rounded-full bg-white border border-[#E5E7EB] shadow-pop flex items-center justify-center hover:bg-[#F9FAFB]"
    >
      <ArrowUp className="w-4 h-4 text-[#1F2937]" />
    </button>
  );
}
