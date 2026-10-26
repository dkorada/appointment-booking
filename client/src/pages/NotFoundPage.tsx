import { Link } from "react-router-dom";

export function NotFoundPage() {
  return (
    <div className="container narrow">
      <div className="card center">
        <p className="eyebrow">404</p>
        <h1 className="h2">This page took a spa day</h1>
        <p className="muted">We couldn't find what you were looking for.</p>
        <Link to="/" className="btn btn-primary">
          Back to booking
        </Link>
      </div>
    </div>
  );
}
