import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { CartProvider } from "./context/CartContext.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import HomePage from "./pages/HomePage.jsx";
import AdminPage from "./pages/AdminPage.jsx";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/"
          element={
            <ErrorBoundary label="витрина">
              <CartProvider>
                <HomePage />
              </CartProvider>
            </ErrorBoundary>
          }
        />
        <Route
          path="/admin/*"
          element={
            <ErrorBoundary label="админка">
              <AdminPage />
            </ErrorBoundary>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
