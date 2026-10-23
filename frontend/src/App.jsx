import { BrowserRouter, Routes, Route } from "react-router-dom";

import { AuthProvider } from "./context/AuthContext";
import { ToastProvider } from "./context/ToastContext";
import { ConfirmProvider } from "./context/ConfirmContext";
import { LibraryProvider } from "./context/LibraryContext";
import { TitleModalProvider } from "./context/TitleModalContext";
import RequireAuth from "./components/RequireAuth";
import Layout from "./components/Layout";
import HomePage from "./pages/HomePage";
import ForYouPage from "./pages/ForYouPage";
import DiscoverPage from "./pages/DiscoverPage";
import SearchPage from "./pages/SearchPage";
import LibraryPage from "./pages/LibraryPage";
import FriendsPage from "./pages/FriendsPage";
import ProfilePage from "./pages/ProfilePage";
import LoginPage from "./pages/LoginPage";
import SignupPage from "./pages/SignupPage";
import OnboardingPage from "./pages/OnboardingPage";
import NotFoundPage from "./pages/NotFoundPage";
import NewsPage from "./pages/NewsPage";
import QuizzesPage from "./pages/QuizzesPage";
import QuizPage from "./pages/QuizPage";
import TastePage from "./pages/TastePage";
import AdminPage from "./pages/AdminPage";

function SignedIn() {
  return (
    <RequireAuth>
      <LibraryProvider>
        <TitleModalProvider>
          <Layout />
        </TitleModalProvider>
      </LibraryProvider>
    </RequireAuth>
  );
}

function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <ConfirmProvider>
          <AuthProvider>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/signup" element={<SignupPage />} />
              <Route
                path="/onboarding"
                element={
                  <RequireAuth>
                    <OnboardingPage />
                  </RequireAuth>
                }
              />
              <Route element={<SignedIn />}>
                <Route index element={<HomePage />} />
                <Route path="for-you" element={<ForYouPage />} />
                <Route path="discover" element={<DiscoverPage />} />
                <Route path="search" element={<SearchPage />} />
                <Route path="watched" element={<LibraryPage key="watched" mode="watched" />} />
                <Route path="watchlist" element={<LibraryPage key="watchlist" mode="watchlist" />} />
                <Route path="friends" element={<FriendsPage />} />
                <Route path="news" element={<NewsPage />} />
                <Route path="quizzes" element={<QuizzesPage />} />
                <Route path="quiz/:id" element={<QuizPage />} />
                <Route path="taste" element={<TastePage />} />
                <Route path="profile" element={<ProfilePage />} />
                <Route path="admin" element={<AdminPage />} />
                <Route path="*" element={<NotFoundPage />} />
              </Route>
            </Routes>
          </AuthProvider>
        </ConfirmProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}

export default App;
