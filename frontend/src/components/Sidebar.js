import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Truck, Users, Wrench, Package, Droplet, DollarSign, FileText,
  TrendingUp, AlertTriangle, Menu, X, ClipboardCheck, FileCheck,
  MapPin, Book, CircleDot, Building, BarChart3, LogOut, Shield, UserCog,
  Gauge, User, Warehouse, Database, Bell, ChevronDown,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

const NavLink = ({ item, pathname }) => {
  const Icon = item.icon;
  const isActive = pathname === item.path;
  return (
    <Link
      to={item.path}
      data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
      className={`flex items-center gap-3 px-4 py-2.5 rounded-lg transition-all ${
        isActive
          ? 'bg-amber-50 font-semibold'
          : 'text-slate-600 hover:bg-amber-50/50'
      }`}
      style={isActive ? { borderLeft: '3px solid #e3aa27', color: '#c4912a' } : {}}
    >
      <Icon size={18} className={isActive ? 'text-amber-600' : ''} />
      <span className="text-sm">{item.label}</span>
    </Link>
  );
};

const Sidebar = ({ open, setOpen }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout, isManager, isDriverOrUser } = useAuth();
  const [expanded, setExpanded] = useState({});

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
      case 'GROUP_FLEET_MANAGER': return <Shield size={16} className="text-amber-600" />;
      case 'FLEET_MANAGER': return <Users size={16} className="text-amber-600" />;
      case 'FLEET_OFFICER': return <UserCog size={16} className="text-amber-500" />;
      case 'DRIVER': return <Truck size={16} className="text-green-600" />;
      case 'USER': return <User size={16} className="text-slate-600" />;
      default: return <User size={16} className="text-slate-600" />;
    }
  };

  const menu = useMemo(() => {
    const isDriverUser = isDriverOrUser && isDriverOrUser();
    const isMgr = isManager && isManager();

    if (isDriverUser) {
      return {
        top: [
          { path: '/', icon: TrendingUp, label: 'My Dashboard' },
          { path: '/pre-trip-checklist', icon: ClipboardCheck, label: 'Pre-Trip Check' },
          { path: '/logbook', icon: Book, label: 'My Logbook' },
          { path: '/driving-metrics', icon: Gauge, label: 'Driving Metrics' },
        ],
        sections: [
          {
            id: 'operations',
            label: 'Operations',
            items: [{ path: '/maintenance-requests', icon: FileCheck, label: 'My Requests' }],
          },
          {
            id: 'reports',
            label: 'Reports',
            items: [{ path: '/reports', icon: BarChart3, label: 'My Reports' }],
          },
        ],
        mid: [],
      };
    }

    const sections = [
      {
        id: 'drivers',
        label: 'Drivers',
        items: [
          { path: '/drivers', icon: Users, label: 'Drivers' },
          { path: '/driving-metrics', icon: Gauge, label: 'Driving Metrics' },
          { path: '/pre-trip-checklist', icon: ClipboardCheck, label: 'Pre-trip Checks' },
          { path: '/logbook', icon: Book, label: 'Driver Logbook' },
        ],
      },
      {
        id: 'operations',
        label: 'Operations',
        items: [
          { path: '/maintenance', icon: Wrench, label: 'Maintenance Records' },
          { path: '/maintenance-requests', icon: FileCheck, label: 'Maintenance Requests' },
          { path: '/tires', icon: CircleDot, label: 'Tire Management' },
          { path: '/inventory', icon: Package, label: 'Inventory' },
          { path: '/workshop', icon: Warehouse, label: 'Workshop / Garage' },
        ],
      },
      {
        id: 'finance',
        label: 'Finance',
        items: [
          { path: '/expenditures', icon: DollarSign, label: 'Expenditures' },
          { path: '/vendors', icon: Building, label: 'Vendors' },
        ],
      },
      {
        id: 'compliance',
        label: 'Compliance',
        items: [
          { path: '/safety', icon: AlertTriangle, label: 'Safety' },
          { path: '/assets', icon: TrendingUp, label: 'Assets' },
          { path: '/documents', icon: FileText, label: 'Documents' },
        ],
      },
      {
        id: 'analytics',
        label: 'Analytics',
        items: [{ path: '/reports', icon: BarChart3, label: 'Reports & TCO' }],
      },
      {
        id: 'configuration',
        label: 'Configuration',
        items: [{ path: '/master-data', icon: Database, label: 'Master Data' }],
      },
    ];

    if (isMgr) {
      sections.push({
        id: 'admin',
        label: 'Admin',
        items: [
          { path: '/users', icon: UserCog, label: 'User Management' },
          { path: '/reminder-settings', icon: Bell, label: 'Driver Reminders' },
        ],
      });
    }

    return {
      top: [
        { path: '/', icon: TrendingUp, label: 'Dashboard' },
        { path: '/fleet-map', icon: MapPin, label: 'Fleet Map' },
        { path: '/vehicles', icon: Truck, label: 'Vehicles' },
      ],
      // Fuel stays as a standalone always-visible link (between Operations and Finance)
      mid: [{ afterSection: 'operations', path: '/fuel', icon: Droplet, label: 'Fuel' }],
      sections,
    };
  }, [isDriverOrUser, isManager, user?.role]);

  // Auto-expand the section that contains the current route
  useEffect(() => {
    const pathname = location.pathname;
    const activeSection = menu.sections.find((section) =>
      section.items.some((item) => item.path === pathname)
    );
    if (activeSection) {
      setExpanded((prev) => ({ ...prev, [activeSection.id]: true }));
    }
  }, [location.pathname, menu.sections]);

  const toggleSection = (id) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const renderSections = () => {
    const nodes = [];
    menu.sections.forEach((section) => {
      const isOpen = !!expanded[section.id];
      const hasActive = section.items.some((item) => item.path === location.pathname);

      nodes.push(
        <div key={section.id} className="pt-2">
          <button
            type="button"
            onClick={() => toggleSection(section.id)}
            data-testid={`nav-section-${section.id}`}
            aria-expanded={isOpen}
            className={`w-full flex items-center justify-between px-4 py-2 rounded-lg text-left transition-colors ${
              hasActive ? 'text-amber-700' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
            }`}
          >
            <span className="text-xs font-semibold uppercase tracking-wider">{section.label}</span>
            <ChevronDown
              size={14}
              className={`shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-0' : '-rotate-90'}`}
            />
          </button>
          {isOpen && (
            <div className="mt-0.5 space-y-0.5 pl-1">
              {section.items.map((item) => (
                <NavLink key={item.path} item={item} pathname={location.pathname} />
              ))}
            </div>
          )}
        </div>
      );

      // Inject standalone Fuel link after Operations
      const midItems = (menu.mid || []).filter((m) => m.afterSection === section.id);
      midItems.forEach((item) => {
        nodes.push(
          <div key={item.path} className="pt-1">
            <NavLink item={item} pathname={location.pathname} />
          </div>
        );
      });
    });
    return nodes;
  };

  return (
    <>
      <button
        data-testid="sidebar-toggle-btn"
        onClick={() => setOpen(!open)}
        className="fixed top-4 left-4 z-50 lg:hidden bg-white p-2 rounded-lg shadow-lg"
      >
        {open ? <X size={24} /> : <Menu size={24} />}
      </button>

      <aside
        className={`fixed left-0 top-0 h-screen w-64 bg-white border-r border-slate-200 transition-transform duration-300 z-40 flex flex-col ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="p-6 border-b border-amber-100">
          <div className="flex items-center gap-2">
            <img src="/gti-logo.png" alt="GTI Fleet" className="h-10" />
          </div>
          <p className="text-xs text-slate-500 mt-1">Fleet Solutions</p>
        </div>

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
          {menu.top.map((item) => (
            <NavLink key={item.path} item={item} pathname={location.pathname} />
          ))}
          {renderSections()}
        </nav>

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
