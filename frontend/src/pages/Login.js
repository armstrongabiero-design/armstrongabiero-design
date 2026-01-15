import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Truck, Shield, Users } from 'lucide-react';

const Login = () => {
  const { login, register } = useAuth();
  const [activeTab, setActiveTab] = useState('login');
  const [loading, setLoading] = useState(false);

  const [loginData, setLoginData] = useState({ email: '', password: '' });
  const [registerData, setRegisterData] = useState({
    email: '',
    password: '',
    full_name: '',
    role: 'DRIVER',
    country: 'GHANA',
  });

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(loginData.email, loginData.password);
      toast.success('Login successful!');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const user = await register(registerData);
      if (user.is_approved) {
        toast.success('Registration successful!');
      } else {
        toast.success('Registration submitted! Waiting for Group Fleet Manager approval.');
      }
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Registration failed');
    } finally {
      setLoading(false);
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
            <h1 className="text-3xl font-bold text-white">Fleet<span className="text-purple-400">Hub</span></h1>
          </div>
          <p className="text-slate-400">Multi-Country Fleet Management System</p>
          <p className="text-slate-500 text-sm mt-1">Ghana • Liberia • São Tomé</p>
        </div>

        {/* Auth Card */}
        <div className="bg-white rounded-2xl shadow-2xl p-8">
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
                  <Input
                    type="password"
                    value={loginData.password}
                    onChange={(e) => setLoginData({ ...loginData, password: e.target.value })}
                    placeholder="••••••••"
                    required
                    data-testid="login-password"
                  />
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
                  <Input
                    type="password"
                    value={registerData.password}
                    onChange={(e) => setRegisterData({ ...registerData, password: e.target.value })}
                    placeholder="••••••••"
                    required
                    data-testid="register-password"
                  />
                </div>
                <div>
                  <Label>Role</Label>
                  <Select value={registerData.role} onValueChange={(value) => setRegisterData({ ...registerData, role: value })}>
                    <SelectTrigger data-testid="register-role">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="GROUP_FLEET_MANAGER">
                        <div className="flex items-center gap-2">
                          <Shield size={16} className="text-purple-600" />
                          Group Fleet Manager (GTI Office)
                        </div>
                      </SelectItem>
                      <SelectItem value="COUNTRY_FLEET_MANAGER">
                        <div className="flex items-center gap-2">
                          <Users size={16} className="text-blue-600" />
                          Country Fleet Manager
                        </div>
                      </SelectItem>
                      <SelectItem value="DRIVER">
                        <div className="flex items-center gap-2">
                          <Truck size={16} className="text-green-600" />
                          Driver
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {registerData.role !== 'GROUP_FLEET_MANAGER' && (
                  <div>
                    <Label>Country</Label>
                    <Select value={registerData.country} onValueChange={(value) => setRegisterData({ ...registerData, country: value })}>
                      <SelectTrigger data-testid="register-country">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="GHANA">Ghana 🇬🇭</SelectItem>
                        <SelectItem value="LIBERIA">Liberia 🇱🇷</SelectItem>
                        <SelectItem value="SAO_TOME">São Tomé 🇸🇹</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <Button type="submit" className="w-full" disabled={loading} data-testid="register-btn">
                  {loading ? 'Registering...' : 'Register'}
                </Button>
                <p className="text-xs text-slate-500 text-center">
                  {registerData.role === 'GROUP_FLEET_MANAGER' 
                    ? 'Group Fleet Manager accounts are auto-approved.' 
                    : 'Your account will need approval from the Group Fleet Manager.'}
                </p>
              </form>
            </TabsContent>
          </Tabs>
        </div>

        {/* Demo Credentials */}
        <div className="mt-6 text-center">
          <p className="text-slate-400 text-sm">Demo: Create a Group Fleet Manager account to get started</p>
        </div>
      </div>
    </div>
  );
};

export default Login;
