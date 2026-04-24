import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './components/AuthContext';
import ErrorBoundary from './components/ErrorBoundary';
import Home from './pages/Home';
import TopicSwipe from './pages/TopicSwipe';
import ResultShare from './pages/ResultShare';
import ProfileLeaderboard from './pages/ProfileLeaderboard';
import UserProfileDetail from './pages/UserProfileDetail';

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <Router>
          <div className="min-h-screen bg-gray-50 text-gray-900 font-sans">
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/topic/:newsId" element={<TopicSwipe />} />
              <Route path="/result/:topicId" element={<ResultShare />} />
              <Route path="/profile" element={<ProfileLeaderboard />} />
              <Route path="/user/:userId" element={<UserProfileDetail />} />
            </Routes>
          </div>
        </Router>
      </AuthProvider>
    </ErrorBoundary>
  );
}
