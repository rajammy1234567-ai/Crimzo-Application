import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ToastProvider } from './contexts/ToastContext';
import ProtectedRoute from './components/ProtectedRoute';

import AdminLayout from './components/AdminLayout';

import Dashboard from './pages/Dashboard';
import Login from './pages/Login';
import Users from './pages/Users';
import Streams from './pages/Streams';
import Reels from './pages/Reels';
import Stickers from './pages/Stickers';
import Billing from './pages/Billing';
import Withdrawals from './pages/Withdrawals';
import Tasks from './pages/Tasks';

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <Routes>
            <Route path="/login" element={<Login />} />

            <Route path="/" element={<ProtectedRoute><AdminLayout /></ProtectedRoute>}>
              <Route index element={<Navigate to="/dashboard" replace />} />
              <Route path="dashboard" element={<Dashboard />} />
              <Route path="users" element={<Users />} />
              <Route path="streams" element={<Streams />} />
              <Route path="reels" element={<Reels />} />
              <Route path="stickers" element={<Stickers />} />
              <Route path="billing" element={<Billing />} />
              <Route path="withdrawals" element={<Withdrawals />} />
              <Route path="tasks" element={<Tasks />} />
            </Route>
          </Routes>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;