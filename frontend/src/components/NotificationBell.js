import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { Bell } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { Button } from './ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

/**
 * In-app notification bell for drivers (and any user with notifications).
 */
export default function NotificationBell() {
  const { token, isAuthenticated } = useAuth();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);

  const fetchNotes = useCallback(async () => {
    if (!token) return;
    try {
      const { data } = await axios.get(`${API}/notifications/mine`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setItems(data.notifications || []);
      setUnread(data.unread_count || 0);
    } catch {
      /* ignore */
    }
  }, [token]);

  useEffect(() => {
    if (!isAuthenticated) return undefined;
    fetchNotes();
    const id = setInterval(fetchNotes, 60000);
    return () => clearInterval(id);
  }, [isAuthenticated, fetchNotes]);

  const markAll = async () => {
    try {
      await axios.post(`${API}/notifications/read-all`, {}, {
        headers: { Authorization: `Bearer ${token}` },
      });
      fetchNotes();
    } catch {
      /* ignore */
    }
  };

  const markOne = async (id) => {
    try {
      await axios.post(`${API}/notifications/${id}/read`, {}, {
        headers: { Authorization: `Bearer ${token}` },
      });
      fetchNotes();
    } catch {
      /* ignore */
    }
  };

  if (!isAuthenticated) return null;

  return (
    <>
      <button
        type="button"
        data-testid="notification-bell"
        onClick={() => {
          setOpen(true);
          fetchNotes();
        }}
        className="relative p-2 rounded-lg hover:bg-amber-50 text-slate-600"
        aria-label="Notifications"
      >
        <Bell size={20} />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Notifications</DialogTitle>
            <DialogDescription>Reminders and alerts for your account.</DialogDescription>
          </DialogHeader>
          <div className="flex justify-end mb-2">
            {unread > 0 && (
              <Button variant="outline" size="sm" onClick={markAll}>
                Mark all read
              </Button>
            )}
          </div>
          <ul className="space-y-3 max-h-80 overflow-y-auto">
            {items.length === 0 ? (
              <li className="text-sm text-slate-500 text-center py-6">No notifications</li>
            ) : (
              items.map((n) => (
                <li
                  key={n.id}
                  className={`rounded-lg border p-3 text-sm ${
                    n.is_read ? 'border-slate-100 bg-white' : 'border-amber-200 bg-amber-50'
                  }`}
                >
                  <div className="font-semibold text-slate-800">{n.title}</div>
                  <p className="text-slate-600 mt-1">{n.message}</p>
                  <div className="flex justify-between items-center mt-2">
                    <span className="text-xs text-slate-400">
                      {n.local_date || (n.created_at || '').slice(0, 10)}
                    </span>
                    {!n.is_read && (
                      <Button variant="ghost" size="sm" onClick={() => markOne(n.id)}>
                        Mark read
                      </Button>
                    )}
                  </div>
                </li>
              ))
            )}
          </ul>
        </DialogContent>
      </Dialog>
    </>
  );
}
