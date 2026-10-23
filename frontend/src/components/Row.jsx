import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import Icon from "./Icon";
import { RowSkeleton } from "./Skeleton";

// Horizontal shelf of cards with arrow controls and optional gentle
// auto-scroll (pauses on hover/focus/touch, off for reduced motion).
function Row({ title, hint, seeAllTo, seeAllLabel = "See all", loading, empty, autoScroll = false, children, accent }) {
  const trackRef = useRef(null);
  const pausedRef = useRef(false);
  const edgeFrameRef = useRef(0);
  const [edges, setEdges] = useState({ start: true, end: false });

  // Coalesced to one check per frame, and only re-renders when an edge flips.
  function updateEdges() {
    if (edgeFrameRef.current) return;
    edgeFrameRef.current = requestAnimationFrame(() => {
      edgeFrameRef.current = 0;
      const el = trackRef.current;
      if (!el) return;
      const start = el.scrollLeft < 8;
      const end = el.scrollLeft + el.clientWidth >= el.scrollWidth - 8;
      setEdges((prev) => (prev.start === start && prev.end === end ? prev : { start, end }));
    });
  }

  useEffect(() => () => cancelAnimationFrame(edgeFrameRef.current), []);

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
    // Track a fractional position so motion is sub-pixel smooth; resync from
    // the element whenever the user has scrolled it themselves.
    let pos = el.scrollLeft;
    function step(now) {
      const dt = Math.min(now - last, 50);
      last = now;
      if (pausedRef.current || document.hidden || el.scrollWidth <= el.clientWidth) {
        pos = el.scrollLeft;
      } else {
        const max = el.scrollWidth - el.clientWidth;
        if (Math.abs(el.scrollLeft - pos) > 2) pos = el.scrollLeft;
        // Stop for good at the end rather than wrapping back to the start.
        if (pos >= max - 1) return;
        pos = Math.min(pos + dt * 0.03, max);
        el.scrollLeft = pos;
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
          className={`rowTrack${autoScroll ? " rowTrack--auto" : ""}`}
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
