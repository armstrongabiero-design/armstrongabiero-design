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
import { Truck, Shield, Users, UserCog, User, Search } from 'lucide-react';
import PasswordInput from '../components/PasswordInput';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const Login = () => {
  const navigate = useNavigate();
  const { login, register, isAuthenticated } = useAuth();
  const [activeTab, setActiveTab] = useState('login');
  const [loading, setLoading] = useState(false);
  const [countries, setCountries] = useState([]);
  const [countrySearch, setCountrySearch] = useState('');

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
        const response = await axios.get(`${API}/countries/list`);
        setCountries(response.data.countries || []);
      } catch (error) {
        console.error('Failed to fetch countries:', error);
        // Fallback countries
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
      await login(loginData.email, loginData.password);
      toast.success('Login successful!');
      navigate('/', { replace: true });
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

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

    if (registerData.role !== 'GROUP_FLEET_MANAGER' && !registerData.country) {
      toast.error('Please select a country');
      return;
    }
    
    setLoading(true);
    try {
      const { confirmPassword, ...dataToSend } = registerData;
      const user = await register(dataToSend);
      if (user.is_approved) {
        toast.success('Registration successful!');
        navigate('/', { replace: true });
      } else {
        toast.success('Registration submitted! Waiting for manager approval.');
      }
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  const getRoleDescription = (role) => {
    switch (role) {
      case 'GROUP_FLEET_MANAGER':
        return 'Full system access, approves all users';
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
      case 'GROUP_FLEET_MANAGER':
        return <Shield size={16} className="text-purple-600" />;
      case 'FLEET_MANAGER':
        return <Users size={16} className="text-blue-600" />;
      case 'FLEET_OFFICER':
        return <UserCog size={16} className="text-indigo-600" />;
      case 'DRIVER':
        return <Truck size={16} className="text-green-600" />;
      case 'USER':
        return <User size={16} className="text-slate-600" />;
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-3 mb-4">
            <div className="bg-purple-600 p-3 rounded-xl">
              <Truck className="text-white" size={32} />
            </div>
            <h1 className="text-3xl font-bold text-white">GTI <span className="text-purple-400">FLEET</span></h1>
          </div>
          <p className="text-slate-400">GTI Fleet Solutions</p>
        </div>

        {/* Auth Card */}
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
                    className="text-sm text-purple-600 hover:text-purple-700"
                    data-testid="forgot-password-link"
                  >
                    Forgot password?
                  </Link>
                </div>
                <Button type="submit" className="w-full" disabled={loading} data-testid="login-btn">
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
                      <SelectItem value="GROUP_FLEET_MANAGER">
                        <div className="flex items-center gap-2">
                          {getRoleIcon('GROUP_FLEET_MANAGER')}
                          <span>Group Fleet Manager</span>
                        </div>
                      </SelectItem>
                      <SelectItem value="FLEET_MANAGER">
                        <div className="flex items-center gap-2">
                          {getRoleIcon('FLEET_MANAGER')}
                          <span>Fleet Manager</span>
                        </div>
                      </SelectItem>
                      <SelectItem value="FLEET_OFFICER">
                        <div className="flex items-center gap-2">
                          {getRoleIcon('FLEET_OFFICER')}
                          <span>Fleet Officer</span>
                        </div>
                      </SelectItem>
                      <SelectItem value="DRIVER">
                        <div className="flex items-center gap-2">
                          {getRoleIcon('DRIVER')}
                          <span>Driver</span>
                        </div>
                      </SelectItem>
                      <SelectItem value="USER">
                        <div className="flex items-center gap-2">
                          {getRoleIcon('USER')}
                          <span>User</span>
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-slate-500 mt-1">{getRoleDescription(registerData.role)}</p>
                </div>
                
                {registerData.role !== 'GROUP_FLEET_MANAGER' && (
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
                )}
                
                <Button type="submit" className="w-full" disabled={loading} data-testid="register-btn">
                  {loading ? 'Registering...' : 'Register'}
                </Button>
                <p className="text-xs text-slate-500 text-center">
                  {registerData.role === 'GROUP_FLEET_MANAGER' 
                    ? 'Group Fleet Manager accounts are auto-approved.' 
                    : 'Your account will need approval from a manager.'}
                </p>
              </form>
            </TabsContent>
          </Tabs>
        </div>

        {/* Demo Credentials */}
        <div className="mt-6 text-center">
          <p className="text-slate-400 text-sm">Create a Group Fleet Manager account to get started</p>
        </div>
      </div>
    </div>
  );
};

export default Login;
