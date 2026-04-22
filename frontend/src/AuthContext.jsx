import { useEffect, useState } from 'react';
import { api } from './api';
import { AuthContext } from './auth-context';

function readStoredUser() {
  const saved = localStorage.getItem('user');
  if (!saved) {
    return null;
  }

  try {
    const parsed = JSON.parse(saved);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    localStorage.removeItem('user');
    return null;
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => readStoredUser());
  const [loading, setLoading] = useState(() => Boolean(localStorage.getItem('token')));

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      return undefined;
    }

    let cancelled = false;

    api.me()
      .then((u) => {
        if (cancelled) {
          return;
        }
        setUser(u);
        localStorage.setItem('user', JSON.stringify(u));
      })
      .catch(() => {
        if (cancelled) {
          return;
        }
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        setUser(null);
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const login = async (username, password) => {
    const res = await api.login({ username, password });
    localStorage.setItem('token', res.access_token);
    const u = { user_id: res.user_id, username: res.username };
    localStorage.setItem('user', JSON.stringify(u));
    setUser(u);
    return res;
  };

  const register = async (data) => {
    const res = await api.register(data);
    localStorage.setItem('token', res.access_token);
    const u = { user_id: res.user_id, username: res.username };
    localStorage.setItem('user', JSON.stringify(u));
    setUser(u);
    return res;
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
