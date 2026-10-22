import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import Icon from "./Icon";
import { RowSkeleton } from "./Skeleton";

// Horizontal shelf of cards with arrow controls and optional gentle
// auto-scroll (pauses on hover/focus/touch, off for reduced motion).
function Row({ title, hint, seeAllTo, seeAllLabel = "See all", loading, empty, autoScroll = false, children, accent }) {
  const trackRef = useRef(null);
  const pausedRef = useRef(false);
  const [edges, setEdges] = useState({ start: true, end: false });

  function updateEdges() {
    const el = trackRef.current;
    if (!el) return;
    setEdges({ start: el.scrollLeft < 8, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 8 });
  }

  useEffect(() => {
    updateEdges();
    const el = trackRef.current;
    if (!el) return;
    const ro = new ResizeObserver(updateEdges);
    ro.observe(el);
    return () => ro.disconnect();
  }, [children, loading]);

  useEffect(() => {
    if (!autoScroll || loading) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const el = trackRef.current;
    if (!el) return;
    let frame;
    let last = performance.now();
    let carry = 0;
    function step(now) {
      const dt = Math.min(now - last, 50);
      last = now;
      if (!pausedRef.current && !document.hidden && el.scrollWidth > el.clientWidth) {
        if (el.scrollLeft + el.clientWidth >= el.scrollWidth - 1) {
          el.scrollTo({ left: 0, behavior: "smooth" });
          pausedRef.current = true;
          setTimeout(() => (pausedRef.current = false), 1500);
        } else {
          carry += dt * 0.025;
          if (carry >= 1) {
            el.scrollLeft += Math.floor(carry);
            carry -= Math.floor(carry);
          }
        }
      }
      frame = requestAnimationFrame(step);
    }
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [autoScroll, loading]);

  function scrollBy(dir) {
    const el = trackRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.max(el.clientWidth * 0.85, 300), behavior: "smooth" });
  }

  const pause = () => (pausedRef.current = true);
  const resume = () => (pausedRef.current = false);

  return (
    <section className={`row${accent ? ` row--${accent}` : ""}`}>
      <header className="rowHead">
        <div>
          <h2 className="sectionTitle">{title}</h2>
          {hint && <p className="sectionHint">{hint}</p>}
        </div>
        <div className="rowControls">
          {seeAllTo && (
            <Link className="linkBtn" to={seeAllTo}>
              {seeAllLabel} <Icon name="chevronRight" size={14} />
            </Link>
          )}
          <button className="iconBtn rowArrow" aria-label="Scroll left" disabled={edges.start} onClick={() => scrollBy(-1)}>
            <Icon name="chevronLeft" size={16} />
          </button>
          <button className="iconBtn rowArrow" aria-label="Scroll right" disabled={edges.end} onClick={() => scrollBy(1)}>
            <Icon name="chevronRight" size={16} />
          </button>
        </div>
      </header>
      {loading ? (
        <RowSkeleton />
      ) : empty ? (
        <div className="emptyCard">{empty}</div>
      ) : (
        <div
          className="rowTrack"
          ref={trackRef}
          onScroll={updateEdges}
          onMouseEnter={pause}
          onMouseLeave={resume}
          onFocus={pause}
          onBlur={resume}
          onTouchStart={pause}
          onTouchEnd={() => setTimeout(resume, 3000)}
        >
          {children}
        </div>
      )}
    </section>
  );
}

export default Row;
