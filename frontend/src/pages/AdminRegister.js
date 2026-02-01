import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Truck, Shield, ArrowLeft } from 'lucide-react';
import PasswordInput from '../components/PasswordInput';

const AdminRegister = () => {
  const navigate = useNavigate();
  const { register, isAuthenticated } = useAuth();
  const [loading, setLoading] = useState(false);

  const [registerData, setRegisterData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    full_name: '',
    role: 'GROUP_FLEET_MANAGER',
    country: null,
  });

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      navigate('/', { replace: true });
    }
  }, [isAuthenticated, navigate]);

  const handleRegister = async (e) => {
    e.preventDefault();
    
    if (registerData.password !== registerData.confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    
    if (registerData.password.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }
    
    setLoading(true);
    try {
      const { confirmPassword, ...dataToSend } = registerData;
      const user = await register(dataToSend);
      if (user.is_approved) {
        toast.success('Group Fleet Manager account created successfully!');
        navigate('/', { replace: true });
      }
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-amber-800 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-3 mb-4">
            <img src="https://customer-assets.emergentagent.com/job_fleetwizard-3/artifacts/thwmb0am_GTI.png" alt="GTI Fleet" className="h-14" />
          </div>
          <p className="text-slate-400">Fleet Solutions</p>
        </div>

        {/* Registration Card */}
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-amber-100 rounded-full mb-4">
              <Shield className="text-amber-600" size={32} />
            </div>
            <h2 className="text-2xl font-bold text-slate-800">Group Fleet Manager</h2>
            <p className="text-slate-500 text-sm mt-2">
              Create an administrator account with full system access
            </p>
          </div>

          <form onSubmit={handleRegister} className="space-y-4">
            <div>
              <Label>Full Name</Label>
              <Input
                value={registerData.full_name}
                onChange={(e) => setRegisterData({ ...registerData, full_name: e.target.value })}
                placeholder="Admin Name"
                required
                data-testid="admin-register-name"
              />
            </div>
            <div>
              <Label>Email</Label>
              <Input
                type="email"
                value={registerData.email}
                onChange={(e) => setRegisterData({ ...registerData, email: e.target.value })}
                placeholder="admin@company.com"
                required
                data-testid="admin-register-email"
              />
            </div>
            <div>
              <Label>Password</Label>
              <PasswordInput
                value={registerData.password}
                onChange={(e) => setRegisterData({ ...registerData, password: e.target.value })}
                data-testid="admin-register-password"
              />
            </div>
            <div>
              <Label>Confirm Password</Label>
              <PasswordInput
                value={registerData.confirmPassword}
                onChange={(e) => setRegisterData({ ...registerData, confirmPassword: e.target.value })}
                placeholder="Confirm your password"
                data-testid="admin-register-confirm-password"
              />
              {registerData.password && registerData.confirmPassword && 
               registerData.password !== registerData.confirmPassword && (
                <p className="text-red-500 text-xs mt-1">Passwords do not match</p>
              )}
            </div>
            
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <h4 className="font-semibold text-purple-800 text-sm mb-2">Group Fleet Manager Privileges:</h4>
              <ul className="text-xs text-amber-700 space-y-1">
                <li>• Full access to all countries and features</li>
                <li>• Approve/deny all user registrations</li>
                <li>• Manage Fleet Managers, Officers, and Drivers</li>
                <li>• Access to all reports and analytics</li>
                <li>• System configuration and settings</li>
              </ul>
            </div>

            <Button type="submit" className="w-full" disabled={loading} data-testid="admin-register-btn">
              {loading ? 'Creating Account...' : 'Create Group Fleet Manager Account'}
            </Button>
            
            <p className="text-xs text-green-600 text-center font-medium">
              ✓ Group Fleet Manager accounts are automatically approved
            </p>
          </form>

          <div className="mt-6 text-center">
            <Link 
              to="/login" 
              className="text-amber-600 hover:text-amber-700 text-sm inline-flex items-center gap-2"
            >
              <ArrowLeft size={16} />
              Back to Sign In
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminRegister;
