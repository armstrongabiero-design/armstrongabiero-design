import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'sonner';
import axios from 'axios';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Users, UserCog, User, Search, ShieldCheck, KeyRound, Truck } from 'lucide-react';
import PasswordInput from '../components/PasswordInput';
import { getPasswordPolicyError, PASSWORD_POLICY_HINT } from '../utils/passwordPolicy';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const Login = () => {
  const navigate = useNavigate();
  const { login, register, isAuthenticated } = useAuth();
  const [activeTab, setActiveTab] = useState('login');
  const [loading, setLoading] = useState(false);
  const [countries, setCountries] = useState([]);
  const [countrySearch, setCountrySearch] = useState('');
  
  // OTP verification state
  const [showOtpForm, setShowOtpForm] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [otpEmail, setOtpEmail] = useState('');
  const [otpSending, setOtpSending] = useState(false);

  const [loginData, setLoginData] = useState({ email: '', password: '' });
  const [registerData, setRegisterData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    full_name: '',
    role: 'USER',
    country: '',
  });

  // Fetch countries list
  useEffect(() => {
    const fetchCountries = async () => {
      try {
        const response = await axios.get(`${API}/countries/all-list`);
        setCountries(response.data.countries || []);
      } catch (error) {
        setCountries([
          { code: 'GH', name: 'Ghana' },
          { code: 'LR', name: 'Liberia' },
          { code: 'ST', name: 'São Tomé and Príncipe' },
        ]);
      }
    };
    fetchCountries();
  }, []);

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      navigate('/', { replace: true });
    }
  }, [isAuthenticated, navigate]);

  const filteredCountries = countries.filter(c => 
    c.name.toLowerCase().includes(countrySearch.toLowerCase())
  );

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const response = await axios.post(`${API}/auth/login`, loginData);
      
      // Check if OTP verification is required (Group Fleet Manager)
      if (response.data.requires_otp) {
        setOtpEmail(response.data.email);
        setOtpSending(true);
        
        // Send OTP
        await axios.post(`${API}/auth/send-otp`, loginData);
        toast.success('Verification code sent to your email');
        setShowOtpForm(true);
        setOtpSending(false);
        return;
      }
      
      // Normal login flow
      await login(loginData.email, loginData.password);
      toast.success('Login successful!');
      navigate('/', { replace: true });
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Login failed');
      setOtpSending(false);
    } finally {
      setLoading(false);
    }
  };

  const handleOtpVerify = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const response = await axios.post(`${API}/auth/verify-otp`, {
        email: otpEmail,
        otp: otpCode
      });
      
      // Store token and user data
      localStorage.setItem('token', response.data.access_token);
      localStorage.setItem('user', JSON.stringify(response.data.user));
      
      toast.success('Login successful!');
      window.location.href = '/'; // Force reload to update auth state
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Invalid verification code');
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    setOtpSending(true);
    try {
      await axios.post(`${API}/auth/send-otp`, loginData);
      toast.success('New verification code sent');
    } catch (error) {
      toast.error('Failed to resend code');
    } finally {
      setOtpSending(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    
    if (registerData.password !== registerData.confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    
    const pwErr = getPasswordPolicyError(registerData.password);
    if (pwErr) {
      toast.error(pwErr);
      return;
    }

    if (!registerData.country) {
      toast.error('Please select a country');
      return;
    }
    
    setLoading(true);
    try {
      const { confirmPassword, ...dataToSend } = registerData;
      await register(dataToSend);
      toast.success('Registration submitted! Waiting for manager approval.');
      // Stay on login page - user needs approval
      setActiveTab('login');
      setRegisterData({
        email: '',
        password: '',
        confirmPassword: '',
        full_name: '',
        role: 'USER',
        country: '',
      });
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  const getRoleDescription = (role) => {
    switch (role) {
      case 'FLEET_MANAGER':
        return 'Country management, approves officers & below';
      case 'FLEET_OFFICER':
        return 'Fuel entry & driver operations';
      case 'DRIVER':
        return 'Personal logbook, pre-trip checks, requests';
      case 'USER':
        return 'Basic access, personal reports';
      default:
        return '';
    }
  };

  const getRoleIcon = (role) => {
    switch (role) {
      case 'FLEET_MANAGER':
        return <Users size={16} className="text-amber-600" />;
      case 'FLEET_OFFICER':
        return <UserCog size={16} className="text-amber-500" />;
      case 'DRIVER':
        return <Truck size={16} className="text-green-600" />;
      case 'USER':
        return <User size={16} className="text-slate-600" />;
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{background: 'linear-gradient(135deg, #1e293b 0%, #78350f 50%, #1e293b 100%)'}}>
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-3 mb-4">
            <img src="https://customer-assets.emergentagent.com/job_fleetwizard-3/artifacts/thwmb0am_GTI.png" alt="GTI Fleet" className="h-14" />
          </div>
          <p className="text-slate-400">Fleet Solutions</p>
        </div>

        {/* OTP Verification Form */}
        {showOtpForm ? (
          <div className="bg-white rounded-2xl shadow-2xl p-8">
            <div className="text-center mb-6">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full mb-4" style={{backgroundColor: '#fef8eb'}}>
                <ShieldCheck size={32} style={{color: '#e3aa27'}} />
              </div>
              <h2 className="text-2xl font-bold text-slate-800">Verify Your Identity</h2>
              <p className="text-slate-500 text-sm mt-2">
                A 6-digit verification code has been sent to<br />
                <span className="font-medium text-slate-700">{otpEmail}</span>
              </p>
            </div>

            <form onSubmit={handleOtpVerify} className="space-y-4">
              <div>
                <Label>Verification Code</Label>
                <div className="relative">
                  <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <Input
                    type="text"
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="Enter 6-digit code"
                    className="pl-10 text-center text-xl tracking-widest font-mono"
                    maxLength={6}
                    required
                    data-testid="otp-input"
                  />
                </div>
              </div>

              <Button 
                type="submit" 
                className="w-full" 
                disabled={loading || otpCode.length !== 6}
                style={{backgroundColor: '#e3aa27', color: 'white'}}
                data-testid="verify-otp-btn"
              >
                {loading ? 'Verifying...' : 'Verify & Sign In'}
              </Button>

              <div className="text-center text-sm">
                <span className="text-slate-500">Didn&apos;t receive the code? </span>
                <button
                  type="button"
                  onClick={handleResendOtp}
                  disabled={otpSending}
                  className="font-medium hover:underline"
                  style={{color: '#e3aa27'}}
                >
                  {otpSending ? 'Sending...' : 'Resend'}
                </button>
              </div>

              <button
                type="button"
                onClick={() => {
                  setShowOtpForm(false);
                  setOtpCode('');
                }}
                className="w-full text-sm text-slate-500 hover:text-slate-700"
              >
                ← Back to Sign In
              </button>
            </form>
          </div>
        ) : (
          /* Auth Card */
          <div className="bg-white rounded-2xl shadow-2xl p-8 max-h-[80vh] overflow-y-auto">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-2 mb-6">
                <TabsTrigger value="login">Sign In</TabsTrigger>
              <TabsTrigger value="register">Register</TabsTrigger>
            </TabsList>

            <TabsContent value="login">
              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <Label>Email</Label>
                  <Input
                    type="email"
                    value={loginData.email}
                    onChange={(e) => setLoginData({ ...loginData, email: e.target.value })}
                    placeholder="you@company.com"
                    required
                    data-testid="login-email"
                  />
                </div>
                <div>
                  <Label>Password</Label>
                  <PasswordInput
                    value={loginData.password}
                    onChange={(e) => setLoginData({ ...loginData, password: e.target.value })}
                    data-testid="login-password"
                  />
                </div>
                <div className="flex justify-end">
                  <Link 
                    to="/forgot-password" 
                    className="text-sm hover:underline"
                    style={{color: '#e3aa27'}}
                    data-testid="forgot-password-link"
                  >
                    Forgot password?
                  </Link>
                </div>
                <Button type="submit" className="w-full" disabled={loading} data-testid="login-btn" style={{backgroundColor: '#e3aa27', color: 'white'}}>
                  {loading ? 'Signing in...' : 'Sign In'}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="register">
              <form onSubmit={handleRegister} className="space-y-4">
                <div>
                  <Label>Full Name</Label>
                  <Input
                    value={registerData.full_name}
                    onChange={(e) => setRegisterData({ ...registerData, full_name: e.target.value })}
                    placeholder="John Doe"
                    required
                    data-testid="register-name"
                  />
                </div>
                <div>
                  <Label>Email</Label>
                  <Input
                    type="email"
                    value={registerData.email}
                    onChange={(e) => setRegisterData({ ...registerData, email: e.target.value })}
                    placeholder="you@company.com"
                    required
                    data-testid="register-email"
                  />
                </div>
                <div>
                  <Label>Password</Label>
                  <p className="text-xs text-slate-500 mb-1">{PASSWORD_POLICY_HINT}</p>
                  <PasswordInput
                    value={registerData.password}
                    onChange={(e) => setRegisterData({ ...registerData, password: e.target.value })}
                    data-testid="register-password"
                  />
                </div>
                <div>
                  <Label>Confirm Password</Label>
                  <PasswordInput
                    value={registerData.confirmPassword}
                    onChange={(e) => setRegisterData({ ...registerData, confirmPassword: e.target.value })}
                    placeholder="Confirm your password"
                    data-testid="register-confirm-password"
                  />
                  {registerData.password && registerData.confirmPassword && 
                   registerData.password !== registerData.confirmPassword && (
                    <p className="text-red-500 text-xs mt-1">Passwords do not match</p>
                  )}
                </div>
                <div>
                  <Label>Role</Label>
                  <Select 
                    value={registerData.role} 
                    onValueChange={(value) => setRegisterData({ ...registerData, role: value })}
                  >
                    <SelectTrigger data-testid="register-role">
                      <SelectValue placeholder="Select your role" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="USER">
                        <div className="flex items-center gap-2">
                          {getRoleIcon('USER')}
                          <span>User</span>
                        </div>
                      </SelectItem>
                      <SelectItem value="DRIVER">
                        <div className="flex items-center gap-2">
                          {getRoleIcon('DRIVER')}
                          <span>Driver</span>
                        </div>
                      </SelectItem>
                      <SelectItem value="FLEET_OFFICER">
                        <div className="flex items-center gap-2">
                          {getRoleIcon('FLEET_OFFICER')}
                          <span>Fleet Officer</span>
                        </div>
                      </SelectItem>
                      <SelectItem value="FLEET_MANAGER">
                        <div className="flex items-center gap-2">
                          {getRoleIcon('FLEET_MANAGER')}
                          <span>Fleet Manager</span>
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-slate-500 mt-1">{getRoleDescription(registerData.role)}</p>
                </div>
                
                <div>
                  <Label>Country</Label>
                  <div className="relative">
                    <div className="relative mb-2">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={16} />
                      <Input
                        type="text"
                        placeholder="Search countries..."
                        value={countrySearch}
                        onChange={(e) => setCountrySearch(e.target.value)}
                        className="pl-9"
                      />
                    </div>
                    <Select 
                      value={registerData.country} 
                      onValueChange={(value) => setRegisterData({ ...registerData, country: value })}
                    >
                      <SelectTrigger data-testid="register-country">
                        <SelectValue placeholder="Select country" />
                      </SelectTrigger>
                      <SelectContent className="max-h-[200px]">
                        {filteredCountries.map((country) => (
                          <SelectItem key={country.code} value={country.name}>
                            {country.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                
                <Button type="submit" className="w-full" disabled={loading} data-testid="register-btn" style={{backgroundColor: '#e3aa27', color: 'white'}}>
                  {loading ? 'Registering...' : 'Register'}
                </Button>
                <p className="text-xs text-slate-500 text-center">
                  Your account stays pending until an authorized manager approves it (Group Fleet Manager for
                  new Fleet Managers; Fleet Manager or Group Fleet Manager for Fleet Officers, drivers, and
                  users).
                </p>
              </form>
            </TabsContent>
          </Tabs>
        </div>
        )}
      </div>
    </div>
  );
};

export default Login;
