import { useState } from "react";
import Icon from "./Icon";

// 10-star rating picker. Click a star to set, click the same star to clear.
function RatingInput({ value, onChange, size = 22, disabled = false }) {
  const [hover, setHover] = useState(null);
  const shown = hover ?? value ?? 0;

  return (
    <div className="ratingInput" onMouseLeave={() => setHover(null)} role="radiogroup" aria-label="Your rating">
      {Array.from({ length: 10 }, (_, i) => {
        const n = i + 1;
        return (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={`${n} out of 10`}
            disabled={disabled}
            className={`ratingStar${n <= shown ? " ratingStar--on" : ""}`}
            onMouseEnter={() => setHover(n)}
            onFocus={() => setHover(n)}
            onBlur={() => setHover(null)}
            onClick={() => onChange(value === n ? null : n)}
          >
            <Icon name="star" size={size} filled={n <= shown} strokeWidth={1.5} />
          </button>
        );
      })}
      <span className="ratingValue">{shown ? `${shown}/10` : "Rate"}</span>
    </div>
  );
}

export default RatingInput;
