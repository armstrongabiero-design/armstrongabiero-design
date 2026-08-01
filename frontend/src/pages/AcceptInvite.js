import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import { Label } from '../components/ui/label';
import PasswordInput from '../components/PasswordInput';
import { getPasswordPolicyError, PASSWORD_POLICY_HINT } from '../utils/passwordPolicy';
import { CheckCircle, XCircle } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const AcceptInvite = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(true);
  const [tokenValid, setTokenValid] = useState(false);
  const [expired, setExpired] = useState(false);
  const [email, setEmail] = useState('');
  const [driverName, setDriverName] = useState('');
  const [success, setSuccess] = useState(false);
  const [errorDetail, setErrorDetail] = useState('');

  useEffect(() => {
    const verifyToken = async () => {
      if (!token) {
        setVerifying(false);
        return;
      }
      try {
        const response = await axios.get(`${API}/auth/verify-invite/${token}`);
        if (response.data.valid) {
          setTokenValid(true);
          setEmail(response.data.email || '');
          setDriverName(response.data.driver_name || '');
        } else {
          setExpired(!!response.data.expired);
          setErrorDetail(response.data.detail || 'Invalid invite link');
          setEmail(response.data.email || '');
        }
      } catch {
        setErrorDetail('Could not verify invite link');
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
    const pwErr = getPasswordPolicyError(password);
    if (pwErr) {
      toast.error(pwErr);
      return;
    }
    setLoading(true);
    try {
      await axios.post(`${API}/auth/accept-invite`, {
        token,
        new_password: password,
      });
      setSuccess(true);
      toast.success('Account activated! You can log in now.');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to activate account');
    } finally {
      setLoading(false);
    }
  };

  if (verifying) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-amber-800 to-slate-900 flex items-center justify-center p-4">
        <div className="text-white text-lg">Verifying invite…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-amber-800 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-3 mb-4">
            <img src="/gti-logo.png" alt="GTI Fleet" className="h-14" />
          </div>
          <p className="text-slate-400">Fleet Solutions</p>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl p-8">
          {success ? (
            <div className="text-center space-y-4">
              <CheckCircle className="mx-auto text-green-600" size={48} />
              <h2 className="text-xl font-semibold text-slate-800">You&apos;re all set</h2>
              <p className="text-slate-600 text-sm">Your driver account is active. Sign in with {email}.</p>
              <Button className="w-full" onClick={() => navigate('/login')}>Go to Login</Button>
            </div>
          ) : !token || !tokenValid ? (
            <div className="text-center space-y-4">
              <XCircle className="mx-auto text-red-500" size={48} />
              <h2 className="text-xl font-semibold text-slate-800">
                {expired ? 'Invite expired' : 'Invalid invite'}
              </h2>
              <p className="text-slate-600 text-sm">
                {errorDetail || 'This invite link is not valid.'}
                {expired ? ' Ask your fleet administrator to resend the invite.' : ''}
              </p>
              <Link to="/login" className="text-amber-700 text-sm underline">Back to login</Link>
            </div>
          ) : (
            <>
              <h2 className="text-xl font-semibold text-slate-800 mb-1">Set your password</h2>
              <p className="text-slate-600 text-sm mb-6">
                {driverName ? `Welcome, ${driverName}. ` : ''}
                Create a password for <strong>{email}</strong>. This invite expires 48 hours after it was sent.
              </p>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label>New password</Label>
                  <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} required />
                  <p className="text-xs text-slate-500 mt-1">{PASSWORD_POLICY_HINT}</p>
                </div>
                <div>
                  <Label>Confirm password</Label>
                  <PasswordInput value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? 'Activating…' : 'Activate account'}
                </Button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default AcceptInvite;
