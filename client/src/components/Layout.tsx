import { CalendarHeart, LayoutDashboard } from "lucide-react";
import { Link, NavLink, Outlet, ScrollRestoration } from "react-router-dom";

export function Layout() {
  return (
    <div className="app">
      <header className="topbar">
        <div className="container topbar-inner">
          <Link to="/" className="brand" aria-label="Glow Studio home">
            <span className="brand-mark" aria-hidden>
              <svg viewBox="0 0 64 64" width="30" height="30">
                <rect width="64" height="64" rx="16" fill="currentColor" />
                <circle cx="32" cy="32" r="13" fill="none" stroke="#e8a8a0" strokeWidth="5" />
                <circle cx="44" cy="20" r="4" fill="#f3d6b8" />
              </svg>
            </span>
            <span className="brand-name">Glow Studio</span>
          </Link>
          <nav className="nav">
            <NavLink to="/" end className="nav-link">
              <CalendarHeart size={16} aria-hidden /> Book
            </NavLink>
            <NavLink to="/admin" className="nav-link">
              <LayoutDashboard size={16} aria-hidden /> Admin
            </NavLink>
          </nav>
        </div>
      </header>

      <main className="main">
        <Outlet />
      </main>

      <footer className="footer">
        <div className="container footer-inner">
          <div>
            <strong>Glow Studio</strong>
            <p>214 Mercer Street, New York, NY 10012</p>
          </div>
          <div>
            <strong>Hours</strong>
            <p>Mon–Sat 9:00 AM – 6:00 PM · Lunch 1–2 PM · Closed Sunday</p>
          </div>
          <p className="footer-note">Demo project with sample data. No real appointments or emails are sent.</p>
        </div>
      </footer>
      <ScrollRestoration />
    </div>
  );
}
