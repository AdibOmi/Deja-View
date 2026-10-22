import { useEffect, useState } from "react";
import { api } from "../api";

let posterPromise = null;

// Split-screen auth layout with a slow-drifting wall of trending posters.
function AuthShell({ children }) {
  const [posters, setPosters] = useState([]);

  useEffect(() => {
    posterPromise ||= api.posters().catch(() => ({ posters: [] }));
    posterPromise.then((d) => setPosters(d.posters || []));
  }, []);

  const columns = [0, 1, 2].map((c) => posters.filter((_, i) => i % 3 === c));

  return (
    <div className="authScreen">
      <div className="authArt" aria-hidden="true">
        <div className="posterWall">
          {columns.map((col, i) => (
            <div key={i} className={`posterCol posterCol--${i}`}>
              {[...col, ...col].map((src, j) => (
                <img key={j} src={src} alt="" />
              ))}
            </div>
          ))}
        </div>
        <div className="authArtShade" />
        <div className="authArtCopy">
          <span className="brandMark brandMark--lg">DV</span>
          <h2>
            Never forget <em>why</em> you loved it.
          </h2>
          <p>Your movie journal, recommendations that actually get your taste, and friends to swap picks with.</p>
        </div>
      </div>
      <div className="authPanel">{children}</div>
    </div>
  );
}

export default AuthShell;
