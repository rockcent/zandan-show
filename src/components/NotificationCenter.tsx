import React, { useState, useEffect } from 'react';
import { collection, query, where, orderBy, onSnapshot, doc, updateDoc, addDoc, serverTimestamp, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from './AuthContext';
import { Bell, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigate } from 'react-router-dom';

interface NotificationCenterProps {
  align?: 'left' | 'right';
  iconClassName?: string;
  buttonClassName?: string;
}

export default function NotificationCenter({ 
  align = 'right',
  iconClassName = "text-white/80",
  buttonClassName = "bg-white/10 hover:bg-white/20 border-white/10"
}: NotificationCenterProps) {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<any[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, 'notifications'),
      where('user_id', '==', user.uid),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const notifs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setNotifications(notifs);
    });

    // Simulate receiving a notification if empty
    const generateFakeNotification = async () => {
      const snap = await getDocs(q);
      if (snap.empty) {
        const fakeNotifs = [
          {
            title: "同频召唤",
            message: "系统刚刚在这个星球上，发现了一个与你三观契合度高达 96% 的人。👉 [点击查看Ta是谁]",
            type: "soulmate",
            actionUrl: "/profile"
          },
          {
            title: "战况告急",
            message: "警告：你昨天坚守的阵营正在被多数派疯狂反扑，目前支持率已跌破 30%！👉 [点击回防/拉人]",
            type: "battle",
            actionUrl: "/"
          },
          {
            title: "创作反馈",
            message: "你投喂的爆料话题刚刚突破 10,000 人参与，引发全网大撕裂！👉 [查看你的话题收益]",
            type: "investment",
            actionUrl: "/"
          }
        ];
        const randomNotif = fakeNotifs[Math.floor(Math.random() * fakeNotifs.length)];
        await addDoc(collection(db, 'notifications'), {
          user_id: user.uid,
          title: randomNotif.title,
          message: randomNotif.message,
          type: randomNotif.type,
          read: false,
          actionUrl: randomNotif.actionUrl,
          createdAt: serverTimestamp()
        });
      }
    };

    generateFakeNotification();

    return () => unsubscribe();
  }, [user]);

  const unreadCount = notifications.filter(n => !n.read).length;

  const handleNotificationClick = async (notification: any) => {
    if (!notification.read) {
      const notifRef = doc(db, 'notifications', notification.id);
      await updateDoc(notifRef, { read: true });
    }
    setIsOpen(false);
    if (notification.actionUrl) {
      navigate(notification.actionUrl);
    }
  };

  if (!user) return null;

  return (
    <div className="relative z-50">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className={`relative p-2 rounded-full transition-colors border ${buttonClassName}`}
      >
        <Bell className={`w-6 h-6 ${iconClassName}`} />
        {unreadCount > 0 && (
          <span className="absolute top-0 right-0 w-3 h-3 bg-rose-500 border-2 border-gray-900 rounded-full"></span>
        )}
      </button>

      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsOpen(false)}
              className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40"
            />
            <motion.div 
              initial={{ opacity: 0, y: -10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.95 }}
              className={`absolute ${align === 'left' ? 'left-0' : 'right-0'} mt-2 w-80 bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden z-50`}
            >
              <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                <h3 className="font-bold text-gray-900">通知中心</h3>
                <button onClick={() => setIsOpen(false)} className="text-gray-400 hover:text-gray-600">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="max-h-96 overflow-y-auto">
                {notifications.length === 0 ? (
                  <div className="p-8 text-center text-gray-400">
                    <Bell className="w-8 h-8 mx-auto mb-2 opacity-20" />
                    <p className="text-sm">暂无新通知</p>
                  </div>
                ) : (
                  notifications.map(notif => (
                    <div 
                      key={notif.id}
                      onClick={() => handleNotificationClick(notif)}
                      className={`p-4 border-b border-gray-50 cursor-pointer hover:bg-gray-50 transition-colors ${!notif.read ? 'bg-indigo-50/50' : ''}`}
                    >
                      <div className="flex items-start">
                        <div className={`w-2 h-2 mt-1.5 rounded-full shrink-0 mr-3 ${!notif.read ? 'bg-indigo-500' : 'bg-transparent'}`} />
                        <div>
                          <p className={`text-sm ${!notif.read ? 'font-bold text-gray-900' : 'font-medium text-gray-700'}`}>
                            {notif.title}
                          </p>
                          <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                            {notif.message}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
