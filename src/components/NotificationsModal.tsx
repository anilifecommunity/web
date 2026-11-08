import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { ArrowLeft, RotateCcw, CheckCheck, Bell } from 'lucide-react';

interface Props {
  onClose: () => void;
}

export const NotificationsModal: React.FC<Props> = ({ onClose }) => {
  const [notifications, setNotifications] = useState<Array<{ id: string; title: string; body: string; time: string; unread: boolean }>>([]);

  const markAllRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, unread: false })));
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/90 backdrop-blur-2xl text-white animate-fadeIn flex flex-col">
      <div className="sticky top-0 z-20 flex items-center justify-between px-4 sm:px-8 py-3.5 bg-black/70 backdrop-blur-xl border-b border-white/10">
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="p-2 -ml-2 rounded-full hover:bg-white/10 text-zinc-300 hover:text-white transition-colors cursor-pointer"
            title="Back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h2 className="text-lg font-bold text-white">Notifications</h2>
        </div>

        <div className="flex items-center gap-2">
          {notifications.length > 0 && (
            <button
              onClick={markAllRead}
              className="px-3 py-1.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-zinc-300 hover:text-white flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <CheckCheck className="w-3.5 h-3.5" />
              <span>Mark all read</span>
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 max-w-2xl w-full mx-auto p-4 sm:p-8 flex flex-col justify-center">
        {notifications.length === 0 ? (
          <div className="text-center py-20 space-y-3">
            <div className="w-14 h-14 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center mx-auto text-zinc-500">
              <Bell className="w-6 h-6" />
            </div>
            <h3 className="text-base font-semibold text-white">No notifications</h3>
            <p className="text-xs text-zinc-500 max-w-xs mx-auto">
              You are all caught up! New episode release notices and schedule updates will appear here.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {notifications.map((n) => (
              <div
                key={n.id}
                className="p-4 rounded-2xl bg-zinc-900/80 border border-zinc-800 flex items-start gap-3.5"
              >
                <div className="w-2.5 h-2.5 rounded-full bg-[#74cf66] mt-1.5 shrink-0" />
                <div className="space-y-1">
                  <div className="text-sm font-bold text-white">{n.title}</div>
                  <div className="text-xs text-zinc-400">{n.body}</div>
                  <div className="text-[10px] text-zinc-500">{n.time}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
