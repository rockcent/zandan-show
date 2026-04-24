import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../components/AuthContext';
import { db, logOut } from '../firebase';
import { doc, getDoc, collection, query, orderBy, limit, getDocs, where, runTransaction, serverTimestamp } from 'firebase/firestore';
import { calculateSoulmateAffinity, Soulmate } from '../services/soulmateService';
import { ArrowLeft, LogOut, Trophy, Target, Award, Loader2, Heart, Lock, ShieldAlert } from 'lucide-react';
import { motion } from 'motion/react';
import NotificationCenter from '../components/NotificationCenter';

export default function ProfileLeaderboard() {
  const { user, isAuthReady } = useAuth();
  const navigate = useNavigate();
  const [userProfile, setUserProfile] = useState<any>(null);
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [soulmates, setSoulmates] = useState<Soulmate[]>([]);
  const [unlockedSoulmates, setUnlockedSoulmates] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<'global' | 'soulmates'>('global');
  const [loading, setLoading] = useState(true);
  const [unlockingId, setUnlockingId] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthReady) return;
    if (!user) {
      navigate('/');
      return;
    }

    const fetchProfileData = async () => {
      try {
        const userRef = doc(db, 'users', user.uid);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
          setUserProfile({ id: userSnap.id, ...userSnap.data() });
        }

        const q = query(collection(db, 'users'), orderBy('insight_score', 'desc'), limit(10));
        const querySnapshot = await getDocs(q);
        const leaders = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setLeaderboard(leaders);

        const calculatedSoulmates = await calculateSoulmateAffinity(user.uid);
        setSoulmates(calculatedSoulmates);

        const unlockedQ = query(collection(db, 'unlocked_soulmates'), where('user_id', '==', user.uid));
        const unlockedSnap = await getDocs(unlockedQ);
        const unlockedSet = new Set<string>();
        unlockedSnap.forEach(doc => unlockedSet.add(doc.data().soulmate_id));
        setUnlockedSoulmates(unlockedSet);
      } catch (error) {
        console.error('Error fetching profile data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchProfileData();
  }, [user, isAuthReady, navigate]);

  const handleLogout = async () => {
    await logOut();
    navigate('/');
  };

  const handleUnlock = async (soulmateId: string) => {
    if (!user) return;
    setUnlockingId(soulmateId);
    try {
      const userRef = doc(db, 'users', user.uid);
      await runTransaction(db, async (transaction) => {
        const userDoc = await transaction.get(userRef);
        if (!userDoc.exists()) throw new Error("User not found");
        
        const currentScore = userDoc.data().insight_score || 0;
        if (currentScore < 500) {
          throw new Error("Not enough insight score");
        }

        const unlockRef = doc(collection(db, 'unlocked_soulmates'));
        transaction.set(unlockRef, {
          user_id: user.uid,
          soulmate_id: soulmateId,
          cost: 500,
          createdAt: serverTimestamp()
        });

        transaction.update(userRef, {
          insight_score: currentScore - 500
        });
      });
      
      setUnlockedSoulmates(prev => new Set(prev).add(soulmateId));
      setUserProfile(prev => prev ? { ...prev, insight_score: prev.insight_score - 500 } : null);
      alert('解锁成功！');
    } catch (error: any) {
      console.error('Error unlocking:', error);
      if (error.message === 'Not enough insight score') {
        alert('洞察力积分不足 (需要 500 积分)');
      } else {
        alert('解锁失败，请稍后重试');
      }
    } finally {
      setUnlockingId(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto min-h-screen flex flex-col bg-gray-50 text-gray-900">
      {/* Header */}
      <header className="flex items-center p-4 bg-white shadow-sm z-10 justify-between">
        <button onClick={() => navigate('/')} className="p-2 rounded-full hover:bg-gray-100 transition-colors">
          <ArrowLeft className="w-6 h-6 text-gray-600" />
        </button>
        <h1 className="text-lg font-bold text-gray-800">我的主页</h1>
        <div className="flex items-center space-x-2">
          <NotificationCenter 
            align="right" 
            iconClassName="text-gray-600" 
            buttonClassName="bg-gray-100 hover:bg-gray-200 border-gray-200" 
          />
          <button onClick={handleLogout} className="p-2 rounded-full hover:bg-red-50 transition-colors text-red-500">
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto">
        {/* Profile Section */}
        <section className="bg-white p-6 mb-2">
          <div 
            className="flex items-center space-x-4 mb-6 cursor-pointer hover:bg-gray-50 p-2 -m-2 rounded-xl transition-colors"
            onClick={() => navigate(`/user/${user?.uid}`)}
          >
            {userProfile?.avatar_url ? (
              <img src={userProfile.avatar_url} alt="Avatar" className="w-16 h-16 rounded-full border-2 border-indigo-100" referrerPolicy="no-referrer" />
            ) : (
              <div className="w-16 h-16 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold text-xl">
                {userProfile?.username?.charAt(0) || 'U'}
              </div>
            )}
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-gray-900">{userProfile?.username || '匿名用户'}</h2>
                <span className="text-xs text-indigo-600 font-medium">查看主页 &gt;</span>
              </div>
              <div className="flex items-center mt-1 space-x-2">
                <span className="px-2 py-0.5 bg-indigo-50 text-indigo-600 text-xs font-semibold rounded-md border border-indigo-100">
                  {userProfile?.title || '初出茅庐'}
                </span>
                {userProfile?.total_votes > 5 && (
                  <span className="px-2 py-0.5 bg-rose-50 text-rose-600 text-xs font-semibold rounded-md border border-rose-100 flex items-center">
                    <ShieldAlert className="w-3 h-3 mr-1" />
                    周末斗士
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 text-center mb-4">
            <div className="p-4 bg-gradient-to-br from-amber-50 to-orange-50 rounded-3xl border border-orange-100 shadow-sm relative overflow-hidden">
              <div className="absolute -right-4 -top-4 text-orange-200 opacity-50">
                <Target className="w-24 h-24" />
              </div>
              <Target className="w-8 h-8 mx-auto text-amber-500 mb-2 relative z-10" />
              <p className="text-4xl font-black text-gray-900 relative z-10 tracking-tighter">{userProfile?.total_votes || 0}</p>
              <p className="text-sm font-bold text-orange-600 relative z-10 mt-1">总参与表态</p>
            </div>
            <div className="p-4 bg-gradient-to-br from-purple-50 to-indigo-50 rounded-3xl border border-indigo-100 shadow-sm relative overflow-hidden">
              <div className="absolute -right-4 -top-4 text-indigo-200 opacity-50">
                <Award className="w-24 h-24" />
              </div>
              <Award className="w-8 h-8 mx-auto text-purple-500 mb-2 relative z-10" />
              <p className="text-4xl font-black text-gray-900 relative z-10 tracking-tighter">{userProfile?.insight_score || 0}</p>
              <p className="text-sm font-bold text-indigo-600 relative z-10 mt-1">洞察力积分</p>
            </div>
          </div>
        </section>

        {/* Leaderboard Section */}
        <section className="bg-white min-h-[50vh]">
          <div className="flex border-b border-gray-100">
            <button
              onClick={() => setActiveTab('global')}
              className={`flex-1 py-4 text-sm font-bold text-center border-b-2 transition-colors ${
                activeTab === 'global' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              全服风云榜
            </button>
            <button
              onClick={() => setActiveTab('soulmates')}
              className={`flex-1 py-4 text-sm font-bold text-center border-b-2 transition-colors ${
                activeTab === 'soulmates' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              灵魂契合
            </button>
          </div>

          <div className="p-4">
            {activeTab === 'global' ? (
              <div className="space-y-3">
                {leaderboard.map((leader, index) => (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                    key={leader.id} 
                    onClick={() => navigate(`/user/${leader.id}`)}
                    className={`flex items-center p-3 rounded-2xl cursor-pointer hover:bg-gray-100 transition-colors ${leader.id === user?.uid ? 'bg-indigo-50 border border-indigo-100' : 'bg-gray-50'}`}
                  >
                    <div className={`w-8 text-center font-bold ${index < 3 ? 'text-amber-500 text-lg' : 'text-gray-400'}`}>
                      {index + 1}
                    </div>
                    {leader.avatar_url ? (
                      <img src={leader.avatar_url} alt="Avatar" className="w-10 h-10 rounded-full mx-3" referrerPolicy="no-referrer" />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center font-bold text-gray-500 mx-3">
                        {leader.username?.charAt(0) || 'U'}
                      </div>
                    )}
                    <div className="flex-1">
                      <p className="font-bold text-gray-900">{leader.username}</p>
                      <p className="text-xs text-gray-500">{leader.title}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-indigo-600">{leader.insight_score}</p>
                      <p className="text-[10px] text-gray-400 uppercase">Score</p>
                    </div>
                  </motion.div>
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                {soulmates.length > 0 ? soulmates.map((soulmate, index) => {
                  const isUnlocked = unlockedSoulmates.has(soulmate.userId);
                  return (
                    <motion.div 
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.05 }}
                      key={soulmate.userId} 
                      onClick={() => isUnlocked && navigate(`/user/${soulmate.userId}`)}
                      className={`flex items-center p-3 rounded-2xl bg-rose-50 border border-rose-100 relative overflow-hidden ${isUnlocked ? 'cursor-pointer hover:bg-rose-100 transition-colors' : ''}`}
                    >
                      <div className={`w-12 h-12 rounded-full bg-rose-200 flex items-center justify-center text-rose-600 font-bold mr-3 overflow-hidden ${!isUnlocked ? 'blur-sm' : ''}`}>
                        {soulmate.avatar_url ? (
                          <img src={soulmate.avatar_url} alt="Avatar" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        ) : (
                          soulmate.username.charAt(0)
                        )}
                      </div>
                      <div className="flex-1">
                        <p className={`font-bold text-gray-900 ${!isUnlocked ? 'blur-sm select-none' : ''}`}>
                          {isUnlocked ? soulmate.username : '神秘灵魂'}
                        </p>
                        <p className="text-xs text-rose-600 font-medium">共同话题: {soulmate.commonTopics} 个</p>
                      </div>
                      <div className="text-right flex flex-col items-end">
                        <div className="flex items-center mb-1">
                          <Heart className="w-4 h-4 text-rose-500 mr-1 fill-rose-500" />
                          <p className="font-black text-rose-600 text-lg">{soulmate.affinity.toFixed(0)}%</p>
                        </div>
                        {!isUnlocked && (
                          <button 
                            onClick={() => handleUnlock(soulmate.userId)}
                            disabled={unlockingId === soulmate.userId}
                            className="flex items-center space-x-1 px-3 py-1 bg-rose-500 text-white rounded-full text-xs font-bold hover:bg-rose-600 transition-colors disabled:opacity-50"
                          >
                            {unlockingId === soulmate.userId ? <Loader2 className="w-3 h-3 animate-spin" /> : <Lock className="w-3 h-3" />}
                            <span>500积分破冰</span>
                          </button>
                        )}
                      </div>
                    </motion.div>
                  );
                }) : (
                  <div className="py-12 text-center text-gray-400">
                    <Heart className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                    <p className="font-medium">多参与投票，遇见你的灵魂伴侣</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
