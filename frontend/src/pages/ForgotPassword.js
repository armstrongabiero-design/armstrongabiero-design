import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Truck, ArrowLeft, Mail } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const ForgotPassword = () => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await axios.post(`${API}/auth/forgot-password`, { email });
      setSubmitted(true);
      toast.success('If an account with that email exists, a reset link will be sent.');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to send reset email');
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
            <img src="/gti-logo.png" alt="GTI Fleet" className="h-14" />
          </div>
          <p className="text-slate-400">Fleet Solutions</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          {!submitted ? (
            <>
              <div className="text-center mb-6">
                <div className="bg-amber-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Mail className="text-amber-600" size={28} />
                </div>
                <h2 className="text-2xl font-bold text-slate-800">Forgot Password?</h2>
                <p className="text-slate-500 text-sm mt-2">
                  Enter your email address and we'll send you a link to reset your password.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label>Email Address</Label>
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@company.com"
                    required
                    data-testid="forgot-email"
                  />
                </div>
                <Button 
                  type="submit" 
                  className="w-full" 
                  disabled={loading}
                  data-testid="forgot-submit-btn"
                >
                  {loading ? 'Sending...' : 'Send Reset Link'}
                </Button>
              </form>
            </>
          ) : (
            <div className="text-center">
              <div className="bg-green-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                <Mail className="text-green-600" size={28} />
              </div>
              <h2 className="text-2xl font-bold text-slate-800 mb-2">Check Your Email</h2>
              <p className="text-slate-500 text-sm mb-6">
                If an account exists for <strong>{email}</strong>, you'll receive an email with instructions to reset your password.
              </p>
              <p className="text-slate-400 text-xs mb-4">
                Didn't receive the email? Check your spam folder or try again.
              </p>
              <Button 
                variant="outline" 
                onClick={() => setSubmitted(false)}
                className="w-full"
              >
                Try Another Email
              </Button>
            </div>
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

export default ForgotPassword;
