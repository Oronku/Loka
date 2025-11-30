import {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from 'react';
import { CredentialResponse } from '@react-oauth/google';
import {
  login as apiLogin,
  register as apiRegister,
  User,
} from '../services/api';

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (credentialResponse: CredentialResponse) => void;
  loginWithEmail: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: () => void;
  updateUser: (userData: Partial<User>) => void;
  isAuthenticated: boolean;
  error: string | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Check if user is already logged in (from localStorage)
    const storedToken = localStorage.getItem('authToken');
    const storedUser = localStorage.getItem('user');

    if (storedToken && storedUser) {
      setToken(storedToken);
      setUser(JSON.parse(storedUser));
    }
  }, []);

  const login = (credentialResponse: CredentialResponse) => {
    if (credentialResponse.credential) {
      const token = credentialResponse.credential;

      // Decode JWT to get user info
      const base64Url = token.split('.')[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(
        atob(base64)
          .split('')
          .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
          .join('')
      );

      const payload = JSON.parse(jsonPayload);

      const userData: User = {
        id: payload.sub,
        email: payload.email,
        name: payload.name,
        picture: payload.picture,
      };

      setUser(userData);
      setToken(token);

      // Store in localStorage
      localStorage.setItem('authToken', token);
      localStorage.setItem('user', JSON.stringify(userData));
      setError(null);
    }
  };

  const loginWithEmail = async (email: string, password: string) => {
    try {
      setError(null);

      const { user: userRes, token: tokenRes } = await apiLogin(
        email,
        password
      ).catch((err) => {
        throw new Error(err.response?.data?.error || 'Login failed');
      });

      setUser(userRes);
      setToken(tokenRes);
      localStorage.setItem('user', JSON.stringify(userRes));
      localStorage.setItem('authToken', tokenRes);
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  };

  const register = async (email: string, password: string, name: string) => {
    try {
      setError(null);

      const { user: userRes, token: tokenRes } = await apiRegister(
        email,
        password,
        name
      ).catch((err) => {
        throw new Error(err.response?.data?.error || 'Registration failed');
      });

      setUser(userRes);
      setToken(tokenRes);
      localStorage.setItem('user', JSON.stringify(userRes));
      localStorage.setItem('authToken', tokenRes);
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    setError(null);
    localStorage.removeItem('authToken');
    localStorage.removeItem('user');
  };

  const updateUser = (userData: Partial<User>) => {
    if (user) {
      const updatedUser = { ...user, ...userData };
      setUser(updatedUser);
      localStorage.setItem('user', JSON.stringify(updatedUser));
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        login,
        loginWithEmail,
        register,
        logout,
        updateUser,
        isAuthenticated: !!user,
        error,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
