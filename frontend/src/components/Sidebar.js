import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { 
  Truck, Users, Wrench, Package, Droplet, DollarSign, FileText, 
  TrendingUp, AlertTriangle, Menu, X, ClipboardCheck, FileCheck,
  MapPin, Book, CircleDot, Building, BarChart3, LogOut, Shield, UserCog
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

const Sidebar = ({ open, setOpen }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout, isGroupManager } = useAuth();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const menuItems = [
    { path: '/', icon: TrendingUp, label: 'Dashboard' },
    { path: '/fleet-map', icon: MapPin, label: 'Fleet Map' },
    { path: '/vehicles', icon: Truck, label: 'Vehicles' },
    { path: '/drivers', icon: Users, label: 'Drivers' },
    { path: '/logbook', icon: Book, label: 'Driver Logbook' },
    { path: '/pre-trip-checklist', icon: ClipboardCheck, label: 'Pre-Trip Check' },
    { divider: true, label: 'Operations' },
    { path: '/maintenance', icon: Wrench, label: 'Maintenance' },
    { path: '/maintenance-requests', icon: FileCheck, label: 'Requests' },
    { path: '/tires', icon: CircleDot, label: 'Tire Management' },
    { path: '/inventory', icon: Package, label: 'Inventory' },
    { divider: true, label: 'Finance' },
    { path: '/fuel', icon: Droplet, label: 'Fuel' },
    { path: '/expenditures', icon: DollarSign, label: 'Expenditures' },
    { path: '/vendors', icon: Building, label: 'Vendors' },
    { divider: true, label: 'Compliance' },
    { path: '/documents', icon: FileText, label: 'Documents' },
    { path: '/assets', icon: TrendingUp, label: 'Assets' },
    { path: '/safety', icon: AlertTriangle, label: 'Safety' },
    { divider: true, label: 'Analytics' },
    { path: '/reports', icon: BarChart3, label: 'Reports & TCO' },
    { divider: true, label: 'Admin', requireGroupManager: true },
    { path: '/users', icon: UserCog, label: 'User Management', requireGroupManager: true },
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
        className={`fixed left-0 top-0 h-screen w-64 bg-white border-r border-slate-200 transition-transform duration-300 z-40 flex flex-col ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="p-6 border-b border-slate-200">
          <h1 className="text-2xl font-bold text-slate-800">GTI <span className="text-purple-600">FLEET</span></h1>
          <p className="text-xs text-slate-500 mt-1">GTI Fleet Solutions</p>
        </div>

        {/* User Info */}
        {user && (
          <div className="px-4 py-3 bg-slate-50 border-b border-slate-200">
            <div className="flex items-center gap-2">
              <div className={`p-2 rounded-full ${isGroupManager && isGroupManager() ? 'bg-purple-100' : 'bg-blue-100'}`}>
                {isGroupManager && isGroupManager() ? (
                  <Shield size={16} className="text-purple-600" />
                ) : (
                  <Users size={16} className="text-blue-600" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800 truncate">{user.full_name}</p>
                <p className="text-xs text-slate-500 truncate">
                  {user.role === 'GROUP_FLEET_MANAGER' ? 'Group Manager' : 
                   user.role === 'COUNTRY_FLEET_MANAGER' ? `${user.country} Manager` : 
                   'Driver'}
                </p>
              </div>
            </div>
          </div>
        )}

        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {menuItems.map((item, index) => {
            // Skip items that require Group Manager if user is not one
            if (item.requireGroupManager && (!isGroupManager || !isGroupManager())) {
              return null;
            }
            
            if (item.divider) {
              // Skip divider if it requires Group Manager
              if (item.requireGroupManager && (!isGroupManager || !isGroupManager())) {
                return null;
              }
              return (
                <div key={index} className="pt-4 pb-2">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider px-4">
                    {item.label}
                  </p>
                </div>
              );
            }
            
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
                className={`flex items-center gap-3 px-4 py-2.5 rounded-lg transition-all ${
                  isActive
                    ? 'bg-purple-50 text-purple-700 font-semibold'
                    : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                <Icon size={18} />
                <span className="text-sm">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Logout */}
        <div className="p-4 border-t border-slate-200">
          <button
            onClick={handleLogout}
            data-testid="logout-btn"
            className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-slate-600 hover:bg-red-50 hover:text-red-600 w-full transition-all"
          >
            <LogOut size={18} />
            <span className="text-sm">Logout</span>
          </button>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
