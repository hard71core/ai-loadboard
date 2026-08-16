import { useState } from "react";
import { Route, Routes } from "react-router-dom";
import { useAuth } from "./AuthContext";
import AuthPanel from "./components/AuthPanel";
import { ROLE_LABEL } from "./constants";
import LoadDetailPage from "./pages/LoadDetailPage";
import LoadsPage from "./pages/LoadsPage";

export default function App() {
  const { user, loading: authLoading, logout } = useAuth();

  const [showAuth, setShowAuth] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");

  function openAuth(mode: "login" | "register") {
    setAuthMode(mode);
    setShowAuth(true);
  }

  return (
    <div className="page">
      <header className="hero">
        <div className="hero-top">
          <div className="brand">AI&nbsp;Loadboard</div>
          <div className="auth-status">
            {authLoading ? null : user ? (
              <>
                <span className="user-badge">
                  {user.company_name} · {ROLE_LABEL[user.role]}
                </span>
                <button className="btn small" onClick={logout}>
                  Log out
                </button>
              </>
            ) : (
              <>
                <button className="btn small" onClick={() => openAuth("login")}>
                  Log in
                </button>
                <button
                  className="btn small primary"
                  onClick={() => openAuth("register")}
                >
                  Sign up
                </button>
              </>
            )}
          </div>
        </div>
        <p className="tagline">
          Logistic is easy
        </p>
      </header>

      <main className="container">
        {showAuth && (
          <AuthPanel
            initialMode={authMode}
            onClose={() => setShowAuth(false)}
          />
        )}

        <Routes>
          <Route path="/" element={<LoadsPage openAuth={openAuth} />} />
          <Route path="/loads/:id" element={<LoadDetailPage openAuth={openAuth} />} />
        </Routes>
      </main>
    </div>
  );
}
