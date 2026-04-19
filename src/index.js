// src/index.js
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

console.log("🚀 Smart Calendar loading...");

// Add error boundary
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    console.error("💥 Render error:", error);
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("React Error Boundary caught:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: "20px", color: "white", background: "#1a1d27", fontFamily: "monospace" }}>
          <h2>❌ App Error</h2>
          <pre style={{ whiteSpace: "pre-wrap", fontSize: "12px", color: "#f87171" }}>
            {this.state.error?.toString()}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);

window.addEventListener("error", (e) => {
  console.error("🔴 Global error:", e.error);
});

window.addEventListener("unhandledrejection", (e) => {
  console.error("🔴 Unhandled rejection:", e.reason);
});
