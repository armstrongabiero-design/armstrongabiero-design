import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Shield, ArrowLeft } from 'lucide-react';
import PasswordInput from '../components/PasswordInput';
import { getPasswordPolicyError, PASSWORD_POLICY_HINT } from '../utils/passwordPolicy';

const AdminRegister = () => {
  const navigate = useNavigate();
  const { bootstrapAdmin, isAuthenticated } = useAuth();
  const [loading, setLoading] = useState(false);

  const [registerData, setRegisterData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    full_name: '',
    bootstrapToken: '',
  });

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

    if (registerData.password.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }

    if (!registerData.bootstrapToken?.trim()) {
      toast.error('Bootstrap token is required (set BOOTSTRAP_TOKEN on the server)');
      return;
    }

    setLoading(true);
    try {
      const { confirmPassword, bootstrapToken, ...payload } = registerData;
      await bootstrapAdmin(payload, bootstrapToken.trim());
      toast.success('Group Fleet Manager account created successfully!');
      navigate('/', { replace: true });
    } catch (error) {
      const detail = error.response?.data?.detail;
      toast.error(typeof detail === 'string' ? detail : 'Bootstrap failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-amber-800 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-3 mb-4">
            <img src="https://customer-assets.emergentagent.com/job_fleetwizard-3/artifacts/thwmb0am_GTI.png" alt="GTI Fleet" className="h-14" />
          </div>
          <p className="text-slate-400">Fleet Solutions</p>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-amber-100 rounded-full mb-4">
              <Shield className="text-amber-600" size={32} />
            </div>
            <h2 className="text-2xl font-bold text-slate-800">Initial Group Fleet Manager</h2>
            <p className="text-slate-500 text-sm mt-2">
              One-time setup when no administrator exists. Requires the server{' '}
              <code className="text-xs bg-slate-100 px-1 rounded">BOOTSTRAP_TOKEN</code> and header{' '}
              <code className="text-xs bg-slate-100 px-1 rounded">X-Bootstrap-Token</code>.
            </p>
          </div>

          <form onSubmit={handleRegister} className="space-y-4">
            <div>
              <Label>Bootstrap token</Label>
              <Input
                type="password"
                autoComplete="off"
                value={registerData.bootstrapToken}
                onChange={(e) => setRegisterData({ ...registerData, bootstrapToken: e.target.value })}
                placeholder="From operations / BOOTSTRAP_TOKEN env"
                required
                data-testid="admin-bootstrap-token"
              />
            </div>
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
              <p className="text-xs text-slate-500 mb-1">{PASSWORD_POLICY_HINT}</p>
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
              <h4 className="font-semibold text-purple-800 text-sm mb-2">After bootstrap</h4>
              <p className="text-xs text-amber-800">
                Remove or rotate <code className="text-xs">BOOTSTRAP_TOKEN</code> in production. This endpoint
                is disabled once a Group Fleet Manager exists.
              </p>
            </div>

            <Button type="submit" className="w-full" disabled={loading} data-testid="admin-register-btn">
              {loading ? 'Creating Account...' : 'Create Group Fleet Manager'}
            </Button>
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
