import React, { useState } from 'react';
import '@/App.css';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Dashboard from './pages/Dashboard';
import Vehicles from './pages/Vehicles';
import Drivers from './pages/Drivers';
import Maintenance from './pages/Maintenance';
import Inventory from './pages/Inventory';
import Fuel from './pages/Fuel';
import Expenditures from './pages/Expenditures';
import Documents from './pages/Documents';
import Assets from './pages/Assets';
import Safety from './pages/Safety';
import MaintenanceRequests from './pages/MaintenanceRequests';
import PreTripChecklist from './pages/PreTripChecklist';
import TireManagement from './pages/TireManagement';
import VehicleMap from './pages/VehicleMap';
import DriverLogbook from './pages/DriverLogbook';
import VendorManagement from './pages/VendorManagement';
import Reports from './pages/Reports';
import Login from './pages/Login';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import UserManagement from './pages/UserManagement';
import Sidebar from './components/Sidebar';
import { Toaster } from './components/ui/sonner';

// Protected Route Component
const ProtectedRoute = ({ children }) => {
  const { isAuthenticated, loading } = useAuth();
  
  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-50">
        <div className="text-lg text-slate-600">Loading...</div>
      </div>
    );
  }
  
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  
  return children;
};

// Main App Layout
const AppLayout = () => {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const { isAuthenticated, user, loading } = useAuth();
  const location = window.location.pathname;

  // Show loading while checking auth
  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-50">
        <div className="text-lg text-slate-600">Loading...</div>
      </div>
    );
  }

  // Redirect to login if not authenticated
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // Check if user is approved
  if (!user?.is_approved && user?.role !== 'GROUP_FLEET_MANAGER') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-lg p-8 max-w-md text-center">
          <div className="text-6xl mb-4">⏳</div>
          <h2 className="text-2xl font-bold text-slate-800 mb-2">Account Pending Approval</h2>
          <p className="text-slate-600 mb-4">
            Your account is awaiting approval from the Group Fleet Manager. You'll be notified once approved.
          </p>
          <p className="text-sm text-slate-500">
            Logged in as: {user?.email}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-slate-50">
      <Sidebar open={sidebarOpen} setOpen={setSidebarOpen} />
      <main className={`flex-1 overflow-y-auto transition-all duration-300 ${sidebarOpen ? 'ml-64' : 'ml-0'}`}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/vehicles" element={<Vehicles />} />
          <Route path="/drivers" element={<Drivers />} />
          <Route path="/fleet-map" element={<VehicleMap />} />
          <Route path="/maintenance" element={<Maintenance />} />
          <Route path="/maintenance-requests" element={<MaintenanceRequests />} />
          <Route path="/pre-trip-checklist" element={<PreTripChecklist />} />
          <Route path="/tires" element={<TireManagement />} />
          <Route path="/logbook" element={<DriverLogbook />} />
          <Route path="/inventory" element={<Inventory />} />
          <Route path="/fuel" element={<Fuel />} />
          <Route path="/expenditures" element={<Expenditures />} />
          <Route path="/documents" element={<Documents />} />
          <Route path="/assets" element={<Assets />} />
          <Route path="/safety" element={<Safety />} />
          <Route path="/vendors" element={<VendorManagement />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/users" element={<UserManagement />} />
        </Routes>
      </main>
    </div>
  );
};

function App() {
  return (
    <div className="App">
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/*" element={<AppLayout />} />
          </Routes>
        </BrowserRouter>
        <Toaster position="top-right" />
      </AuthProvider>
    </div>
  );
}

export default App;
