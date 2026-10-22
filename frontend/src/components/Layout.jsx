import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import Icon from "./Icon";
import Avatar from "./Avatar";
import SearchBox from "./SearchBox";
import { useAuth } from "../context/AuthContext";
import { useLibrary } from "../context/LibraryContext";
import { useConfirm } from "../context/ConfirmContext";
import { displayName } from "../lib/format";

const NAV = [
  { to: "/", label: "Home", icon: "home", end: true },
  { to: "/for-you", label: "For You", icon: "sparkles" },
  { to: "/discover", label: "Discover", icon: "compass" },
  { to: "/watched", label: "Watched", icon: "history" },
  { to: "/watchlist", label: "Watch Later", icon: "bookmark" },
  { to: "/news", label: "News", icon: "news" },
  { to: "/quizzes", label: "Quizzes", icon: "trophy" },
  { to: "/friends", label: "Friends", icon: "users" },
  { to: "/taste", label: "Your Taste", icon: "chart" },
];

function Brand() {
  return (
    <NavLink to="/" className="brand" aria-label="Deja View home">
      <span className="brandMark">DV</span>
      <span className="brandName">Deja View</span>
    </NavLink>
  );
}

function Layout() {
  const { user, logout } = useAuth();
  const library = useLibrary();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const location = useLocation();
  const onSearchPage = location.pathname === "/search";

  const badges = {
    "/friends": library.incoming,
    "/": library.inbox.length,
    "/watched": library.watched.length,
    "/watchlist": library.watchlist.length,
    "/news": library.dueReminders.length,
    "/quizzes": library.quizInvites.length,
  };

  async function handleLogout() {
    if (await confirm({ title: "Log out?", message: "You can log back in any time.", confirmLabel: "Log out" })) {
      logout();
      navigate("/login");
    }
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <Brand />
        <nav className="sideNav" aria-label="Main">
          {NAV.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className="sideLink">
              <Icon name={item.icon} size={18} />
              <span>{item.label}</span>
              {(item.to === "/friends" || item.to === "/news" || item.to === "/quizzes") && badges[item.to] > 0 && (
                <span className="navBadge">{badges[item.to]}</span>
              )}
              {(item.to === "/watched" || item.to === "/watchlist") && badges[item.to] > 0 && (
                <span className="navCount">{badges[item.to]}</span>
              )}
              {item.to === "/" && badges["/"] > 0 && <span className="navBadge navBadge--rose">{badges["/"]}</span>}
            </NavLink>
          ))}
        </nav>
        <div className="sideFoot">
          <NavLink to="/profile" className="sideUser">
            <Avatar name={displayName(user)} size={32} />
            <span className="sideUserText">
              <span className="sideUserName">{displayName(user)}</span>
              <span className="sideUserSub">@{user?.username || "…"}</span>
            </span>
            <Icon name="settings" size={16} className="muted" />
          </NavLink>
          <button className="sideLink sideLink--button" onClick={handleLogout}>
            <Icon name="logout" size={18} />
            <span>Log out</span>
          </button>
        </div>
      </aside>

      <div className="main">
        <header className={`topBar${onSearchPage ? " topBar--bare" : ""}`}>
          <div className="topBarBrand">
            <Brand />
          </div>
          {!onSearchPage && <SearchBox compact />}
          <NavLink to="/profile" className="topBarAvatar" aria-label="Profile">
            <Avatar name={displayName(user)} size={32} />
          </NavLink>
        </header>
        <main className="content">
          <Outlet />
        </main>
      </div>

      <nav className="bottomNav" aria-label="Main">
        {[
          { to: "/", icon: "home", label: "Home", end: true, badge: library.inbox.length },
          { to: "/discover", icon: "compass", label: "Discover" },
          { to: "/search", icon: "search", label: "Search" },
          { to: "/watched", icon: "history", label: "Library", also: "/watchlist" },
          { to: "/friends", icon: "users", label: "Friends", badge: library.incoming },
        ].map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) => `bottomLink${isActive || location.pathname === item.also ? " active" : ""}`}
          >
            <span className="bottomIcon">
              <Icon name={item.icon} size={21} />
              {item.badge > 0 && <span className="dotBadge" />}
            </span>
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

export default Layout;
