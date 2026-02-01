import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { 
  Truck, Users, Wrench, Package, Droplet, DollarSign, FileText, 
  TrendingUp, AlertTriangle, Menu, X, ClipboardCheck, FileCheck,
  MapPin, Book, CircleDot, Building, BarChart3, LogOut, Shield, UserCog,
  Gauge, User
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

const Sidebar = ({ open, setOpen }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout, isGroupManager, isManager, isStaff, isDriverOrUser } = useAuth();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const getRoleDisplay = (role) => {
    switch (role) {
      case 'GROUP_FLEET_MANAGER': return 'Group Manager';
      case 'FLEET_MANAGER': return 'Fleet Manager';
      case 'FLEET_OFFICER': return 'Fleet Officer';
      case 'DRIVER': return 'Driver';
      case 'USER': return 'User';
      default: return role;
    }
  };

  const getRoleIcon = (role) => {
    switch (role) {
      case 'GROUP_FLEET_MANAGER': return <Shield size={16} className="text-purple-600" />;
      case 'FLEET_MANAGER': return <Users size={16} className="text-blue-600" />;
      case 'FLEET_OFFICER': return <UserCog size={16} className="text-indigo-600" />;
      case 'DRIVER': return <Truck size={16} className="text-green-600" />;
      case 'USER': return <User size={16} className="text-slate-600" />;
      default: return <User size={16} className="text-slate-600" />;
    }
  };

  // Define menu items based on roles
  const getMenuItems = () => {
    const isDriverUser = isDriverOrUser && isDriverOrUser();
    const isStaffMember = isStaff && isStaff();
    const isGroupMgr = isGroupManager && isGroupManager();
    const isMgr = isManager && isManager();

    if (isDriverUser) {
      // Driver/User menu - limited, personalized view
      return [
        { path: '/', icon: TrendingUp, label: 'My Dashboard' },
        { path: '/pre-trip-checklist', icon: ClipboardCheck, label: 'Pre-Trip Check' },
        { path: '/logbook', icon: Book, label: 'My Logbook' },
        { path: '/driving-metrics', icon: Gauge, label: 'Driving Metrics' },
        { divider: true, label: 'Operations' },
        { path: '/maintenance-requests', icon: FileCheck, label: 'My Requests' },
        { divider: true, label: 'Reports' },
        { path: '/reports', icon: BarChart3, label: 'My Reports' },
      ];
    }

    // Staff/Manager menu - full access
    const items = [
      { path: '/', icon: TrendingUp, label: 'Dashboard' },
      { path: '/fleet-map', icon: MapPin, label: 'Fleet Map' },
      { path: '/vehicles', icon: Truck, label: 'Vehicles' },
      { path: '/drivers', icon: Users, label: 'Drivers' },
      { path: '/logbook', icon: Book, label: 'Driver Logbook' },
      { path: '/driving-metrics', icon: Gauge, label: 'Driving Metrics' },
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
    ];

    // Add admin section for managers
    if (isMgr) {
      items.push({ divider: true, label: 'Admin' });
      items.push({ path: '/users', icon: UserCog, label: 'User Management' });
    }

    return items;
  };

  const menuItems = getMenuItems();

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
        <div className="p-6 border-b border-amber-100">
          <h1 className="text-2xl font-bold text-slate-800">GTI <span className="text-golden" style={{color: '#e3aa27'}}>FLEET</span></h1>
          <p className="text-xs text-slate-500 mt-1">GTI Fleet Solutions</p>
        </div>

        {/* User Info */}
        {user && (
          <div className="px-4 py-3 bg-amber-50/50 border-b border-amber-100">
            <div className="flex items-center gap-2">
              <div className={`p-2 rounded-full ${
                user.role === 'GROUP_FLEET_MANAGER' ? 'bg-amber-100' :
                user.role === 'FLEET_MANAGER' ? 'bg-amber-100' :
                user.role === 'FLEET_OFFICER' ? 'bg-amber-50' :
                user.role === 'DRIVER' ? 'bg-green-100' : 'bg-slate-100'
              }`}>
                {getRoleIcon(user.role)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800 truncate">{user.full_name}</p>
                <p className="text-xs text-slate-500 truncate">
                  {getRoleDisplay(user.role)}
                  {user.country && ` • ${user.country}`}
                </p>
              </div>
            </div>
          </div>
        )}

        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {menuItems.map((item, index) => {
            if (item.divider) {
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
