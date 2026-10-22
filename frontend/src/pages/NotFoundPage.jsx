import { Link } from "react-router-dom";

function NotFoundPage() {
  return (
    <div className="page">
      <div className="emptyCard emptyCard--tall">
        <h2>Deja vu? Not quite.</h2>
        <p className="muted">This page doesn't exist.</p>
        <Link className="btn btn--primary" to="/">
          Back home
        </Link>
      </div>
    </div>
  );
}

export default NotFoundPage;
