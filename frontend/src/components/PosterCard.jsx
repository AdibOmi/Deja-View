import { memo } from "react";
import Icon from "./Icon";
import { posterProps } from "../lib/images";
import { useLibrary } from "../context/LibraryContext";
import { useTitleModal } from "../context/TitleModalContext";
import { useToast } from "../context/ToastContext";

function PosterCard({ title, reason, badge, meta, children, quickActions = true }) {
  const { find, add } = useLibrary();
  const { openTitle } = useTitleModal();
  const { showToast } = useToast();

  const entry = find(title);
  const status = entry?.status;
  const myRating = entry?.my_rating ?? title.my_rating;
  const typeLabel = title.media_type === "series" ? "Series" : "Film";
  const sub = meta ?? [title.year, typeLabel].filter(Boolean).join(" · ");

  async function quick(e, nextStatus) {
    e.stopPropagation();
    try {
      await add(title, nextStatus);
      if (nextStatus === "watched") {
        showToast(`Marked “${title.title}” as watched`, "success", {
          action: { label: "Rate it", onClick: () => openTitle(title) },
        });
      } else {
        showToast(`Saved “${title.title}” for later`, "success");
      }
    } catch {
      // toast already shown by the library store
    }
  }

  return (
    <article className="posterCard">
      <button type="button" className="posterFrame" onClick={() => openTitle(entry || title)} aria-label={`Open ${title.title}`}>
        {title.poster ? (
          <img {...posterProps(title.poster, 185)} alt="" loading="lazy" decoding="async" />
        ) : (
          <span className="posterFallback">{title.title}</span>
        )}
        <span className="posterShade" />

        {myRating ? (
          <span className="scoreBadge scoreBadge--mine">
            <Icon name="star" size={11} filled /> {myRating}
          </span>
        ) : title.rating ? (
          <span className="scoreBadge">
            <Icon name="star" size={11} filled /> {Number(title.rating).toFixed(1)}
          </span>
        ) : null}

        {status && (
          <span className={`statusDot statusDot--${status}`} title={status === "watched" ? "Watched" : "On your watchlist"}>
            <Icon name={status === "watched" ? "check" : "bookmark"} size={12} strokeWidth={2.4} />
          </span>
        )}
      </button>

      {quickActions && status !== "watched" && !entry?.pending && (
        <div className="quickActions">
          {status !== "watchlist" && (
            <button type="button" className="quickBtn" title="Watch later" aria-label="Add to Watch Later" onClick={(e) => quick(e, "watchlist")}>
              <Icon name="bookmark" size={15} />
            </button>
          )}
          <button type="button" className="quickBtn" title="Mark as watched" aria-label="Mark as watched" onClick={(e) => quick(e, "watched")}>
            <Icon name="check" size={16} strokeWidth={2.2} />
          </button>
        </div>
      )}

      <div className="posterMeta">
        {(reason || badge) && (
          <div className="chipRow">
            {badge && <span className="chip chip--teal">{badge}</span>}
            {reason && (
              <span className="chip chip--rose" title={reason}>
                {reason}
              </span>
            )}
          </div>
        )}
        <h3 className="posterTitle" title={title.title}>
          {title.title}
        </h3>
        {sub && <p className="posterSub">{sub}</p>}
        {children}
      </div>
    </article>
  );
}

export default memo(PosterCard);
