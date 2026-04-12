import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import { Label } from '../components/ui/label';
import PasswordInput from '../components/PasswordInput';
import { Truck, ArrowLeft, Lock, CheckCircle, XCircle } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const ResetPassword = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(true);
  const [tokenValid, setTokenValid] = useState(false);
  const [email, setEmail] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const verifyToken = async () => {
      if (!token) {
        setVerifying(false);
        return;
      }
      
      try {
        const response = await axios.get(`${API}/auth/verify-reset-token/${token}`);
        if (response.data.valid) {
          setTokenValid(true);
          setEmail(response.data.email);
        }
      } catch {
        // Token verification failed
      } finally {
        setVerifying(false);
      }
    };

    verifyToken();
  }, [token]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (password !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    
    if (password.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }

    setLoading(true);
    try {
      await axios.post(`${API}/auth/reset-password`, {
        token,
        new_password: password
      });
      setSuccess(true);
      toast.success('Password reset successfully!');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to reset password');
    } finally {
      setLoading(false);
    }
  };

  if (verifying) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-amber-800 to-slate-900 flex items-center justify-center p-4">
        <div className="text-white text-lg">Verifying reset link...</div>
      </div>
    );
  }

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

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          {!token || !tokenValid ? (
            <div className="text-center">
              <div className="bg-red-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                <XCircle className="text-red-600" size={28} />
              </div>
              <h2 className="text-2xl font-bold text-slate-800 mb-2">Invalid Reset Link</h2>
              <p className="text-slate-500 text-sm mb-6">
                This password reset link is invalid or has expired. Please request a new one.
              </p>
              <Link to="/forgot-password">
                <Button className="w-full">Request New Reset Link</Button>
              </Link>
            </div>
          ) : success ? (
            <div className="text-center">
              <div className="bg-green-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="text-green-600" size={28} />
              </div>
              <h2 className="text-2xl font-bold text-slate-800 mb-2">Password Reset!</h2>
              <p className="text-slate-500 text-sm mb-6">
                Your password has been successfully reset. You can now sign in with your new password.
              </p>
              <Link to="/login">
                <Button className="w-full">Sign In</Button>
              </Link>
            </div>
          ) : (
            <>
              <div className="text-center mb-6">
                <div className="bg-amber-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Lock className="text-amber-600" size={28} />
                </div>
                <h2 className="text-2xl font-bold text-slate-800">Reset Password</h2>
                <p className="text-slate-500 text-sm mt-2">
                  Enter your new password for <strong>{email}</strong>
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label>New Password</Label>
                  <PasswordInput
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter new password"
                    data-testid="reset-password"
                  />
                </div>
                <div>
                  <Label>Confirm New Password</Label>
                  <PasswordInput
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm new password"
                    data-testid="reset-confirm-password"
                  />
                </div>
                
                {password && confirmPassword && password !== confirmPassword && (
                  <p className="text-red-500 text-sm">Passwords do not match</p>
                )}
                
                <Button 
                  type="submit" 
                  className="w-full" 
                  disabled={loading || !password || password !== confirmPassword}
                  data-testid="reset-submit-btn"
                >
                  {loading ? 'Resetting...' : 'Reset Password'}
                </Button>
              </form>
            </>
          )}

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

export default ResetPassword;
