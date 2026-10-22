// Posters are stored at w342 (TMDB) or ~380px (legacy OMDb/Amazon URLs), but
// most of the UI shows them far smaller. Asking the CDN for the size we
// actually render cuts poster bytes 3-4x, which is most of the page weight.

const TMDB_SIZES = [92, 154, 185, 342, 500, 780];
const TMDB_RE = /(\/t\/p\/)[a-z0-9]+(\/)/;
const AMAZON_RE = /\._V1_[^/]*?\.(jpg|jpeg|png|webp)$/i;

// Within 10% is sharp enough (e.g. a 2x 185px card gets w342, not w500).
function tmdbSize(px) {
  return TMDB_SIZES.find((s) => s >= px * 0.9) || "original";
}

export function sizedImage(url, px) {
  if (!url) return url;
  if (TMDB_RE.test(url)) {
    const size = tmdbSize(px);
    return url.replace(TMDB_RE, `$1${size === "original" ? size : `w${size}`}$2`);
  }
  if (AMAZON_RE.test(url)) return url.replace(AMAZON_RE, `._V1_QL75_UX${px}_.$1`);
  return url;
}

// src + srcSet for an image rendered `px` CSS pixels wide (1x and 2x screens).
export function posterProps(url, px) {
  if (!url) return {};
  const one = sizedImage(url, px);
  const two = sizedImage(url, px * 2);
  return one === two ? { src: one } : { src: one, srcSet: `${one} 1x, ${two} 2x` };
}
