import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Truck, Users, Wrench, Package, Droplet, DollarSign, FileText, TrendingUp, AlertTriangle, Menu, X, ClipboardCheck, FileCheck } from 'lucide-react';

const Sidebar = ({ open, setOpen }) => {
  const location = useLocation();

  const menuItems = [
    { path: '/', icon: TrendingUp, label: 'Dashboard' },
    { path: '/vehicles', icon: Truck, label: 'Vehicles' },
    { path: '/drivers', icon: Users, label: 'Drivers' },
    { path: '/pre-trip-checklist', icon: ClipboardCheck, label: 'Pre-Trip Check' },
    { path: '/maintenance', icon: Wrench, label: 'Maintenance' },
    { path: '/maintenance-requests', icon: FileCheck, label: 'Requests' },
    { path: '/inventory', icon: Package, label: 'Inventory' },
    { path: '/fuel', icon: Droplet, label: 'Fuel' },
    { path: '/expenditures', icon: DollarSign, label: 'Expenditures' },
    { path: '/documents', icon: FileText, label: 'Documents' },
    { path: '/assets', icon: TrendingUp, label: 'Assets' },
    { path: '/safety', icon: AlertTriangle, label: 'Safety' },
  ];

  return (
    <>
      {/* Mobile toggle */}
      <button
        data-testid="sidebar-toggle-btn"
        onClick={() => setOpen(!open)}
        className="fixed top-4 left-4 z-50 lg:hidden bg-white p-2 rounded-lg shadow-lg"
      >
        {open ? <X size={24} /> : <Menu size={24} />}
      </button>

      {/* Sidebar */}
      <aside
        className={`fixed left-0 top-0 h-screen w-64 bg-white border-r border-slate-200 transition-transform duration-300 z-40 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="p-6 border-b border-slate-200">
          <h1 className="text-2xl font-bold text-slate-800">Fleet<span className="text-purple-600">Hub</span></h1>
          <p className="text-xs text-slate-500 mt-1">Multi-Country Fleet Management</p>
        </div>

        <nav className="p-4 space-y-1 overflow-y-auto max-h-[calc(100vh-100px)]">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                data-testid={`nav-${item.label.toLowerCase().replace(' ', '-')}`}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
                  isActive
                    ? 'bg-purple-50 text-purple-700 font-semibold'
                    : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                <Icon size={20} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </aside>
    </>
  );
};

export default Sidebar;
