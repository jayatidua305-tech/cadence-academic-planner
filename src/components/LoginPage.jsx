// src/components/LoginPage.jsx
// Login page with email authentication — Fordham-branded

import React, { useState } from "react";

export default function LoginPage({ onLogin }) {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!email.trim()) {
      setError("Please enter your email address");
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setError("Please enter a valid email address");
      return;
    }

    setIsLoading(true);
    setError(null);

    setTimeout(() => {
      try {
        localStorage.setItem("smart_cal_user_email", email.trim());
        localStorage.setItem("smart_cal_user_authenticated", "true");
        localStorage.setItem("smart_cal_login_time", new Date().toISOString());

        setSubmitted(true);
        setIsLoading(false);

        setTimeout(() => {
          onLogin(email.trim());
        }, 500);
      } catch (err) {
        setError("An error occurred. Please try again.");
        setIsLoading(false);
      }
    }, 800);
  };

  return (
    <div className="login-root">
      {/* Left: Fordham hero */}
      <div className="login-hero">
        <div className="login-hero-brand">
          <img
            src="/fordham-logo.png"
            alt="Fordham University"
            className="login-hero-logo-img"
          />
          <div className="login-hero-brand-text">FORDHAM UNIVERSITY</div>
        </div>

        <div className="login-hero-body">
          <div className="login-hero-chip">
            <span className="login-hero-chip-dot" />
            Cadence · Adaptive Academic Planner
          </div>
          <h1 className="login-hero-title">
            Your semester,<br />
            <span className="login-hero-title-accent">on your rhythm.</span>
          </h1>
          <p className="login-hero-sub">
            Upload a syllabus, and your calendar fills itself. Track study time,
            compete with friends, and get your sharpest work done when you are
            sharpest.
          </p>
        </div>

        <div className="login-hero-footer">Adaptive Academic Planner · Built for Rams</div>
      </div>

      {/* Right: form */}
      <div className="login-form-wrap">
        <div className="login-form-card">
          <div className="login-form-head">
            <h2 className="login-form-title">Sign in</h2>
            <p className="login-form-sub">
              Use your Fordham email to continue. We&apos;ll never share your address.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="login-form">
            {submitted && (
              <div className="login-alert login-alert-success fade-in">
                Welcome! Redirecting to your calendar…
              </div>
            )}
            {error && (
              <div className="login-alert login-alert-error fade-in">{error}</div>
            )}

            <label className="login-label">
              Email Address
              <input
                className="input"
                type="email"
                placeholder="your.email@fordham.edu"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (error) setError(null);
                }}
                disabled={isLoading || submitted}
                autoFocus
              />
            </label>

            <button
              type="submit"
              disabled={isLoading || submitted}
              className="btn btn-primary login-submit"
            >
              {isLoading && <div className="spinner login-spinner" />}
              {!isLoading && !submitted && "Continue with email"}
              {!isLoading && submitted && "Signed in"}
            </button>
          </form>

          <ul className="login-bullets">
            <li><span className="login-bullet-dot" />Syllabus events appear in your calendar automatically.</li>
            <li><span className="login-bullet-dot" />Track time, see streaks, compete on the leaderboard.</li>
            <li><span className="login-bullet-dot" />Voice control and AI scheduling built in.</li>
          </ul>

          <div className="login-footer">© 2026 Cadence · Fordham University</div>
        </div>
      </div>

      <style>{`
        .login-root {
          display: flex;
          min-height: 100vh;
          background: var(--bg);
          font-family: 'Plus Jakarta Sans', ui-sans-serif, system-ui, -apple-system, sans-serif;
        }
        .login-hero {
          flex: 1.1;
          background: var(--grad-fordham);
          color: #fff;
          padding: 48px 56px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          min-height: 100vh;
          position: relative;
          overflow: hidden;
        }
        .login-hero::before {
          content: "";
          position: absolute;
          inset: 0;
          background: radial-gradient(circle at 80% 20%, rgba(255,255,255,0.08), transparent 40%),
                      radial-gradient(circle at 15% 85%, rgba(212,160,23,0.12), transparent 50%);
          pointer-events: none;
        }
        .login-hero > * { position: relative; z-index: 1; }
        .login-hero-brand {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .login-hero-logo-img {
          display: block;
          height: 64px;
          width: auto;
          /* Blend the maroon box of the logo into the maroon hero so only
             the white "F" monogram shows — no pasted-on rectangle. */
          mix-blend-mode: lighten;
        }
        .login-hero-brand-text {
          font-weight: 600;
          font-size: 13px;
          letter-spacing: 0.12em;
          color: #fff;
        }
        .login-hero-body {
          max-width: 560px;
          display: flex;
          flex-direction: column;
          gap: 22px;
        }
        .login-hero-chip {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 6px 14px;
          background: rgba(255,255,255,0.12);
          border: 1px solid rgba(255,255,255,0.16);
          backdrop-filter: blur(6px);
          border-radius: 999px;
          font-size: 12px;
          font-weight: 500;
          width: fit-content;
        }
        .login-hero-chip-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: var(--fordham-gold-l);
        }
        .login-hero-title {
          font-size: 56px;
          font-weight: 700;
          line-height: 1.05;
          letter-spacing: -0.02em;
          margin: 0;
          color: #ffffff;
        }
        .login-hero-title-accent {
          color: var(--fordham-gold-l);
        }
        .login-hero-sub {
          font-size: 17px;
          line-height: 1.55;
          color: rgba(255,255,255,0.82);
        }
        .login-hero-footer {
          font-size: 12px;
          letter-spacing: 0.08em;
          color: rgba(255,255,255,0.55);
          text-transform: uppercase;
        }
        .login-form-wrap {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 48px 32px;
          background: var(--bg);
        }
        .login-form-card {
          width: 100%;
          max-width: 420px;
        }
        .login-form-head {
          margin-bottom: 28px;
        }
        .login-form-title {
          font-size: 28px;
          font-weight: 700;
          color: var(--text);
          letter-spacing: -0.015em;
          margin-bottom: 6px;
        }
        .login-form-sub {
          font-size: 13.5px;
          color: var(--muted);
          line-height: 1.55;
        }
        .login-form {
          display: flex;
          flex-direction: column;
          gap: 18px;
          margin-bottom: 20px;
        }
        .login-label {
          display: flex;
          flex-direction: column;
          gap: 8px;
          font-size: 12px;
          font-weight: 600;
          color: var(--text);
        }
        .login-alert {
          padding: 10px 14px;
          border-radius: var(--radius-sm);
          font-size: 13px;
          font-weight: 500;
          border: 1px solid transparent;
        }
        .login-alert-success {
          background: rgba(4,120,87,0.08);
          color: var(--green-d);
          border-color: rgba(4,120,87,0.25);
        }
        .login-alert-error {
          background: rgba(185,28,28,0.08);
          color: var(--red-d);
          border-color: rgba(185,28,28,0.25);
        }
        .login-submit {
          padding: 12px 16px;
          font-size: 14px;
          font-weight: 600;
        }
        .login-spinner {
          width: 14px;
          height: 14px;
          border-width: 2px;
          border-top-color: #fff;
          border-color: rgba(255,255,255,0.4);
          border-top: 2px solid #fff;
        }
        .login-bullets {
          list-style: none;
          padding: 16px 0 0;
          border-top: 1px solid var(--border);
          display: flex;
          flex-direction: column;
          gap: 10px;
          margin-top: 20px;
        }
        .login-bullets li {
          font-size: 12.5px;
          color: var(--muted);
          line-height: 1.55;
          display: flex;
          align-items: flex-start;
          gap: 10px;
        }
        .login-bullet-dot {
          width: 5px;
          height: 5px;
          border-radius: 50%;
          background: var(--fordham-maroon);
          flex-shrink: 0;
          margin-top: 7px;
        }
        .login-footer {
          margin-top: 28px;
          font-size: 11px;
          text-align: center;
          color: var(--hint);
          letter-spacing: 0.02em;
        }

        @media (max-width: 900px) {
          .login-root { flex-direction: column; }
          .login-hero {
            min-height: auto;
            padding: 36px 28px;
          }
          .login-hero-title { font-size: 40px; }
          .login-form-wrap { padding: 32px 20px; }
        }
      `}</style>
    </div>
  );
}
