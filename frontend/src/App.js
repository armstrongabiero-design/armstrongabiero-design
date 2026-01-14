import React, { useState } from 'react';
import '@/App.css';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
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
import Sidebar from './components/Sidebar';
import { Toaster } from './components/ui/sonner';

function App() {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <div className="App">
      <BrowserRouter>
        <div className="flex h-screen bg-slate-50">
          <Sidebar open={sidebarOpen} setOpen={setSidebarOpen} />
          <main className={`flex-1 overflow-y-auto transition-all duration-300 ${sidebarOpen ? 'ml-64' : 'ml-0'}`}>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/vehicles" element={<Vehicles />} />
              <Route path="/drivers" element={<Drivers />} />
              <Route path="/maintenance" element={<Maintenance />} />
              <Route path="/maintenance-requests" element={<MaintenanceRequests />} />
              <Route path="/pre-trip-checklist" element={<PreTripChecklist />} />
              <Route path="/inventory" element={<Inventory />} />
              <Route path="/fuel" element={<Fuel />} />
              <Route path="/expenditures" element={<Expenditures />} />
              <Route path="/documents" element={<Documents />} />
              <Route path="/assets" element={<Assets />} />
              <Route path="/safety" element={<Safety />} />
            </Routes>
          </main>
        </div>
      </BrowserRouter>
      <Toaster position="top-right" />
    </div>
  );
}

export default App;
