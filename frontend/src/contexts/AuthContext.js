import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const AuthContext = createContext(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [serverUnavailable, setServerUnavailable] = useState(false);

  const fetchUser = useCallback(async () => {
    setServerUnavailable(false);
    try {
      const response = await axios.get(`${API}/auth/me`);
      setUser(response.data);
    } catch (error) {
      const status = error.response?.status;
      if (status === 401 || status === 403) {
        localStorage.removeItem('token');
        delete axios.defaults.headers.common['Authorization'];
        setToken(null);
        setUser(null);
      } else {
        // An outage or server error says nothing about the session, so keep the token.
        setServerUnavailable(true);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      fetchUser();
    } else {
      setLoading(false);
    }
  }, [token, fetchUser]);

  const login = async (email, password) => {
    const response = await axios.post(`${API}/auth/login`, {
      email: (email || '').trim(),
      password,
    });
    // Group Fleet Manager OTP challenge — do not store a token
    if (response.data?.requires_otp) {
      return response.data;
    }
    const { access_token, user: userData } = response.data;
    if (!access_token) {
      throw new Error(response.data?.detail || 'Login failed');
    }

    localStorage.setItem('token', access_token);
    axios.defaults.headers.common['Authorization'] = `Bearer ${access_token}`;
    setToken(access_token);
    setUser(userData);

    return userData;
  };

  const register = async (data) => {
    const payload = {
      ...data,
      email: (data?.email || '').trim().toLowerCase(),
    };
    const response = await axios.post(`${API}/auth/register`, payload);
    // Self-registration never returns a JWT — account stays pending approval
    if (response.data?.access_token) {
      const { access_token, user: userData } = response.data;
      localStorage.setItem('token', access_token);
      axios.defaults.headers.common['Authorization'] = `Bearer ${access_token}`;
      setToken(access_token);
      setUser(userData);
      return userData;
    }
    return response.data;
  };

  const bootstrapAdmin = async (data, bootstrapToken) => {
    const response = await axios.post(`${API}/auth/bootstrap`, data, {
      headers: { 'X-Bootstrap-Token': bootstrapToken },
    });
    const { access_token, user: userData } = response.data;
    localStorage.setItem('token', access_token);
    axios.defaults.headers.common['Authorization'] = `Bearer ${access_token}`;
    setToken(access_token);
    setUser(userData);
    return userData;
  };

  const retrySession = () => {
    setLoading(true);
    fetchUser();
  };

  const logout = () => {
    setServerUnavailable(false);
    localStorage.removeItem('token');
    delete axios.defaults.headers.common['Authorization'];
    setToken(null);
    setUser(null);
  };

  const isGroupManager = () => user?.role === 'GROUP_FLEET_MANAGER';
  const isFleetManager = () => user?.role === 'FLEET_MANAGER';
  const isFleetOfficer = () => user?.role === 'FLEET_OFFICER';
  const isDriver = () => user?.role === 'DRIVER';
  const isUser = () => user?.role === 'USER';
  const isManager = () => isGroupManager() || isFleetManager();
  const isStaff = () => isManager() || isFleetOfficer();
  const isDriverOrUser = () => isDriver() || isUser();

  const value = {
    user,
    token,
    loading,
    login,
    register,
    bootstrapAdmin,
    logout,
    serverUnavailable,
    retrySession,
    isGroupManager,
    isFleetManager,
    isFleetOfficer,
    isDriver,
    isUser,
    isManager,
    isStaff,
    isDriverOrUser,
    isAuthenticated: !!user,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export default AuthContext;
