import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../components/AuthContext';
import { signInWithGoogle, db } from '../firebase';
import { collection, addDoc, serverTimestamp, getDocs, query, orderBy, limit, doc, runTransaction, getDoc, setDoc, where } from 'firebase/firestore';
import { generateTopics, generateTrendingTopics } from '../services/geminiService';
import { Loader2, Zap, User as UserIcon, Plus, X, ThumbsUp, ThumbsDown, Coins, Sparkles, Share2, Bot, Leaf, DollarSign, Scale, Globe, Users, Brain, Shield, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence, useMotionValue, useTransform } from 'motion/react';
import NotificationCenter from '../components/NotificationCenter';

const getTagIcon = (tag: string) => {
  const lowerTag = tag.toLowerCase();
  if (lowerTag.includes('ai') || lowerTag.includes('人工智能') || lowerTag.includes('科技')) return <Bot className="w-full h-full" />;
  if (lowerTag.includes('环保') || lowerTag.includes('环境') || lowerTag.includes('气候')) return <Leaf className="w-full h-full" />;
  if (lowerTag.includes('经济') || lowerTag.includes('钱') || lowerTag.includes('金融')) return <DollarSign className="w-full h-full" />;
  if (lowerTag.includes('法律') || lowerTag.includes('公平') || lowerTag.includes('争议')) return <Scale className="w-full h-full" />;
  if (lowerTag.includes('全球') || lowerTag.includes('国际') || lowerTag.includes('世界')) return <Globe className="w-full h-full" />;
  if (lowerTag.includes('社会') || lowerTag.includes('人群') || lowerTag.includes('大众')) return <Users className="w-full h-full" />;
  if (lowerTag.includes('心理') || lowerTag.includes('认知') || lowerTag.includes('思考')) return <Brain className="w-full h-full" />;
  if (lowerTag.includes('安全') || lowerTag.includes('隐私') || lowerTag.includes('保护')) return <Shield className="w-full h-full" />;
  return <AlertCircle className="w-full h-full" />;
};

export default function Home() {
  const { user, isAuthReady } = useAuth();
  const navigate = useNavigate();

  // Swipe State
  const [topics, setTopics] = useState<any[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [comboCount, setComboCount] = useState(0);
  const [showCombo, setShowCombo] = useState(false);
  const [swipeDirection, setSwipeDirection] = useState<'left' | 'right' | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const isDraggingRef = useRef(false);
  const [cooldown, setCooldown] = useState(false);
  const [investingTopicId, setInvestingTopicId] = useState<string | null>(null);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [content, setContent] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isAutoFetching, setIsAutoFetching] = useState(false);
  const [recommendedTags, setRecommendedTags] = useState<string[]>([]);

  // Polar Night Mode
  const [isPolarNight, setIsPolarNight] = useState(false);

  useEffect(() => {
    const fetchRecommendedTags = async () => {
      if (isModalOpen && user) {
        try {
          const userDoc = await getDoc(doc(db, 'users', user.uid));
          if (userDoc.exists()) {
            const tagWeights = userDoc.data().tag_weights || {};
            const topTags = Object.entries(tagWeights)
              .sort(([, a], [, b]) => (b as number) - (a as number))
              .slice(0, 5)
              .map(([tag]) => tag);
            setRecommendedTags(topTags);
          }
        } catch (error) {
          console.error("Error fetching tag weights:", error);
        }
      }
    };
    fetchRecommendedTags();
  }, [isModalOpen, user]);

  useEffect(() => {
    const checkPolarNight = () => {
      const now = new Date();
      const day = now.getDay();
      const hour = now.getHours();
      // Friday (5) 20:00 to Sunday (0) 20:00
      if (
        (day === 5 && hour >= 20) ||
        (day === 6) ||
        (day === 0 && hour < 20)
      ) {
        setIsPolarNight(true);
      } else {
        setIsPolarNight(false);
      }
    };
    checkPolarNight();
    const interval = setInterval(checkPolarNight, 60000);
    return () => clearInterval(interval);
  }, []);

  // Motion values for swipe rotation
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-200, 200], [-15, 15]);
  const dragOpacity = useTransform(x, [-200, 0, 200], [0, 1, 0]);

  useEffect(() => {
    const fetchInitialTopics = async () => {
      try {
        // 1. Global Recall: Fetch top 50 topics by controversy_score
        const q = query(collection(db, 'topics'), orderBy('controversy_score', 'desc'), limit(50));
        const querySnapshot = await getDocs(q);
        let fetchedTopics = querySnapshot.docs.map(doc => ({ 
          id: doc.id, 
          ...doc.data(),
          newsSummary: (doc.data() as any).news_summary // Map Firestore news_summary to local newsSummary
        }));

        // 2. Personalized Re-ranking (Client-side)
        if (user) {
          // Fetch user's past votes to filter them out
          const userVotesQuery = query(collection(db, 'votes'), where('user_id', '==', user.uid));
          const userVotesSnapshot = await getDocs(userVotesQuery);
          const votedTopicIds = new Set(userVotesSnapshot.docs.map(doc => doc.data().topic_id));
          
          // Filter out topics the user has already voted on
          fetchedTopics = fetchedTopics.filter(topic => !votedTopicIds.has(topic.id));

          const userDoc = await getDoc(doc(db, 'users', user.uid));
          if (userDoc.exists()) {
            const tagWeights = userDoc.data().tag_weights || {};
            const alpha = 0.6; // Weight for global controversy
            const beta = 0.4;  // Weight for personal preference

            // Calculate S_feed for each topic
            fetchedTopics = fetchedTopics.map((topic: any) => {
              const cGlobal = topic.controversy_score || 0;
              let mPersonal = 0;
              
              if (topic.tags && Array.isArray(topic.tags)) {
                topic.tags.forEach((tag: string) => {
                  mPersonal += (tagWeights[tag] || 0);
                });
              }

              // Normalize M_personal (simple approach: cap it or scale it, here we just use it directly, 
              // in a real system you'd want to normalize C_global and M_personal to similar ranges)
              // For now, we'll just add them with coefficients
              const sFeed = (alpha * cGlobal) + (beta * mPersonal);
              
              return { 
                ...topic, 
                sFeed
              };
            });

            // Sort by S_feed descending
            fetchedTopics.sort((a: any, b: any) => b.sFeed - a.sFeed);

            // 3. Epsilon-Greedy Exploration (inject 20% random/new topics)
            // For simplicity in this demo, we'll just shuffle the bottom 20% to simulate exploration
            // A true implementation would fetch completely new topics not in the top 50
            const explorationCount = Math.floor(fetchedTopics.length * 0.2);
            if (explorationCount > 0) {
              const topTopics = fetchedTopics.slice(0, fetchedTopics.length - explorationCount);
              const bottomTopics = fetchedTopics.slice(fetchedTopics.length - explorationCount);
              // Shuffle bottom topics
              bottomTopics.sort(() => Math.random() - 0.5);
              fetchedTopics = [...topTopics, ...bottomTopics];
            }
          }
        }

        if (fetchedTopics.length === 0 && user) {
          // Automatically fetch if no topics and user is logged in
          setLoading(false);
          handleAutoFetch();
        } else {
          setTopics(fetchedTopics);
          setLoading(false);
        }
      } catch (error) {
        console.error('Error fetching topics:', error);
        setLoading(false);
      }
    };
    
    if (isAuthReady) {
      fetchInitialTopics();
    }
  }, [isAuthReady, user]);

  const handleVote = async (stance: 'AGREE' | 'DISAGREE') => {
    if (!user) {
      await signInWithGoogle();
      return;
    }
    if (currentIndex >= topics.length || cooldown) return;

    setCooldown(true);

    // Haptic feedback
    if (navigator.vibrate) {
      navigator.vibrate(50);
    }

    const currentTopic = topics[currentIndex];
    const topicRef = doc(db, 'topics', currentTopic.id);
    const userRef = doc(db, 'users', user.uid);

    // Optimistic UI Update
    setSwipeDirection(stance === 'AGREE' ? 'right' : 'left');
    
    // Move to next card immediately for smooth animation
    if (currentIndex < topics.length - 1) {
      setCurrentIndex(prev => prev + 1);
    } else {
      setTimeout(() => {
        navigate(`/result/${currentTopic.id}`, { state: { stance } });
      }, 300);
    }

    // Reset swipe direction after animation
    setTimeout(() => setSwipeDirection(null), 300);

    try {
      // 0. Check for Shadowban
      const userSnap = await getDoc(userRef);
      if (userSnap.exists() && userSnap.data().status === 'BANNED') {
        // Shadowban: Fake success
        console.log("Vote recorded (shadowban).");
        
        let newCombo = comboCount + 1;
        
        // Fake Combo Effect
        setComboCount(newCombo);
        if (newCombo % 10 === 0) {
          setShowCombo(true);
          setTimeout(() => setShowCombo(false), 1500);
        }
      } else {
        // 1. Record the vote
        const voteRef = doc(db, 'votes', `${user.uid}_${currentTopic.id}`);
        await setDoc(voteRef, {
          user_id: user.uid,
          topic_id: currentTopic.id,
          stance: stance,
          createdAt: serverTimestamp(),
        });

        // 2. Update topic counts, user total_votes, and tag_weights
        let isMajority = false;
        await runTransaction(db, async (transaction) => {
          const topicDoc = await transaction.get(topicRef);
          const userDoc = await transaction.get(userRef);

          if (!topicDoc.exists() || !userDoc.exists()) {
            throw new Error("Document does not exist!");
          }

          const newAgreeCount = (topicDoc.data().agree_count || 0) + (stance === 'AGREE' ? 1 : 0);
          const newDisagreeCount = (topicDoc.data().disagree_count || 0) + (stance === 'DISAGREE' ? 1 : 0);
          const newTotalVotes = (userDoc.data().total_votes || 0) + 1;

          const totalTopicVotes = newAgreeCount + newDisagreeCount;
          const agreeRatio = totalTopicVotes > 0 ? newAgreeCount / totalTopicVotes : 0.5;
          const controversyScore = (1 - 2 * Math.abs(agreeRatio - 0.5)) * Math.log10(totalTopicVotes + 1);

          let newInsightScore = (userDoc.data().insight_score || 0) + 2;
          let newCombo = comboCount + 1;
          if (newCombo % 10 === 0) {
            newInsightScore += 20; // Bonus points for 10 combo
          }

          // Update tag_weights
          const currentTagWeights = userDoc.data().tag_weights || {};
          const topicTags = topicDoc.data().tags || [];
          const newTagWeights = { ...currentTagWeights };
          
          topicTags.forEach((tag: string) => {
            newTagWeights[tag] = (newTagWeights[tag] || 0) + 2; // +2 weight for voting
          });

          transaction.update(topicRef, {
            agree_count: newAgreeCount,
            disagree_count: newDisagreeCount,
            controversy_score: controversyScore
          });

          transaction.update(userRef, {
            total_votes: newTotalVotes,
            insight_score: newInsightScore,
            tag_weights: newTagWeights
          });
        });

        // Handle Combo Effect
        const newCombo = comboCount + 1;
        setComboCount(newCombo);
        if (newCombo % 10 === 0) {
          setShowCombo(true);
          setTimeout(() => setShowCombo(false), 1500);
        }
      }

    } catch (error) {
      console.error('Error voting:', error);
      // Revert optimistic update on failure if needed, but for now just show error
      alert('Failed to submit vote. Please try again.');
    } finally {
      setTimeout(() => setCooldown(false), 300);
    }
  };

  const handleShare = async (topic: any, e: React.MouseEvent) => {
    e.stopPropagation();
    const shareUrl = topic.news_id 
      ? `${window.location.origin}/topic/${topic.news_id}` 
      : window.location.origin;
      
    const shareData = {
      title: '赞弹秀 - ' + (topic.category || '争议话题'),
      text: topic.statement,
      url: shareUrl,
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        await navigator.clipboard.writeText(`${shareData.title}\n${shareData.text}\n${shareData.url}`);
        alert('链接已复制到剪贴板！');
      }
    } catch (err) {
      console.error('Error sharing:', err);
    }
  };

  const handleInvest = async (topicId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) {
      await signInWithGoogle();
      return;
    }
    if (investingTopicId === topicId) return;

    setInvestingTopicId(topicId);
    try {
      const userRef = doc(db, 'users', user.uid);
      await runTransaction(db, async (transaction) => {
        const userDoc = await transaction.get(userRef);
        if (!userDoc.exists()) throw new Error("User not found");
        
        const currentScore = userDoc.data().insight_score || 0;
        if (currentScore < 50) {
          throw new Error("Not enough insight score");
        }

        // ALL READS MUST HAPPEN BEFORE ANY WRITES
        const topicRef = doc(db, 'topics', topicId);
        const topicDoc = await transaction.get(topicRef);

        const currentTagWeights = userDoc.data().tag_weights || {};
        const newTagWeights = { ...currentTagWeights };
        
        if (topicDoc.exists()) {
          const topicTags = topicDoc.data().tags || [];
          topicTags.forEach((tag: string) => {
            newTagWeights[tag] = (newTagWeights[tag] || 0) + 10;
          });
        }

        const investmentRef = doc(collection(db, 'investments'));
        transaction.set(investmentRef, {
          user_id: user.uid,
          topic_id: topicId,
          amount: 50,
          createdAt: serverTimestamp()
        });

        transaction.update(userRef, {
          insight_score: currentScore - 50,
          tag_weights: newTagWeights
        });
      });
      alert('投资成功！消耗 50 洞察力积分。');
    } catch (error: any) {
      console.error('Error investing:', error);
      if (error.message === 'Not enough insight score') {
        alert('洞察力积分不足 (需要 50 积分)');
      } else {
        alert('投资失败，请稍后重试');
      }
    } finally {
      setInvestingTopicId(null);
    }
  };

  const handleAutoFetch = async () => {
    if (!user) {
      return;
    }

    setIsAutoFetching(true);
    try {
      const result = await generateTrendingTopics();

      const newsRef = await addDoc(collection(db, 'newsItems'), {
        submitter_id: user.uid,
        raw_content: "全网自动抓取热点",
        summary: result.summary || "全网热门争议话题",
        createdAt: serverTimestamp(),
      });

      const newTopics = [];
      for (const topic of result.topics) {
        const topicRef = await addDoc(collection(db, 'topics'), {
          news_id: newsRef.id,
          statement: topic.statement,
          category: topic.category || "争议话题",
          hook: topic.hook || "",
          perspective_agree: topic.perspective_agree || "",
          perspective_disagree: topic.perspective_disagree || "",
          image_keyword: topic.image_keyword || "news",
          tags: topic.tags || [],
          agree_count: 0,
          disagree_count: 0,
          controversy_score: 0,
          news_summary: result.summary || "全网热门争议话题",
          createdAt: serverTimestamp(),
        });
        newTopics.push({
          id: topicRef.id,
          news_id: newsRef.id,
          statement: topic.statement,
          category: topic.category || "争议话题",
          hook: topic.hook || "",
          perspective_agree: topic.perspective_agree || "",
          perspective_disagree: topic.perspective_disagree || "",
          image_keyword: topic.image_keyword || "news",
          tags: topic.tags || [],
          agree_count: 0,
          disagree_count: 0,
          newsSummary: result.summary || "全网热门争议话题"
        });
      }

      setTopics(prev => {
        const remaining = prev.slice(currentIndex);
        return [...newTopics, ...remaining];
      });
      setCurrentIndex(0);
    } catch (error: any) {
      console.error('Error auto fetching topics:', error);
      alert(error.message || '抓取热点失败，请稍后重试。');
    } finally {
      setIsAutoFetching(false);
    }
  };

  const handleGenerate = async () => {
    if (!user) {
      await signInWithGoogle();
      return;
    }
    if (!content.trim()) return;

    setIsGenerating(true);
    try {
      const result = await generateTopics(content);

      const newsRef = await addDoc(collection(db, 'newsItems'), {
        submitter_id: user.uid,
        raw_content: content,
        summary: result.summary || "热门争议话题",
        createdAt: serverTimestamp(),
      });

      const newTopics = [];
      for (const topic of result.topics) {
        const topicRef = await addDoc(collection(db, 'topics'), {
          news_id: newsRef.id,
          statement: topic.statement,
          category: topic.category || "争议话题",
          hook: topic.hook || "",
          perspective_agree: topic.perspective_agree || "",
          perspective_disagree: topic.perspective_disagree || "",
          image_keyword: topic.image_keyword || "news",
          tags: topic.tags || [],
          agree_count: 0,
          disagree_count: 0,
          controversy_score: 0,
          news_summary: result.summary || "热门争议话题",
          createdAt: serverTimestamp(),
        });
        newTopics.push({
          id: topicRef.id,
          news_id: newsRef.id,
          statement: topic.statement,
          category: topic.category || "争议话题",
          hook: topic.hook || "",
          perspective_agree: topic.perspective_agree || "",
          perspective_disagree: topic.perspective_disagree || "",
          image_keyword: topic.image_keyword || "news",
          tags: topic.tags || [],
          agree_count: 0,
          disagree_count: 0,
          newsSummary: result.summary || "热门争议话题"
        });
      }

      // Unshift new topics to the front of the remaining topics
      setTopics(prev => {
        const remaining = prev.slice(currentIndex);
        return [...newTopics, ...remaining];
      });
      setCurrentIndex(0); // Reset index to show the newly added topics
      setIsModalOpen(false);
      setContent('');
    } catch (error: any) {
      console.error('Error generating topics:', error);
      alert(error.message || 'Failed to generate topics. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  return (
    <div className={`max-w-md mx-auto min-h-screen flex flex-col relative overflow-hidden transition-colors duration-1000 ${isPolarNight ? 'bg-zinc-950 text-zinc-100' : 'bg-gray-900 text-white'}`}>
      {/* Polar Night Background Effects */}
      {isPolarNight && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-rose-600/20 rounded-full blur-[100px]" />
          <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-emerald-600/20 rounded-full blur-[100px]" />
        </div>
      )}

      {/* Header */}
      <header className={`relative flex items-center justify-between p-6 z-50 ${isPolarNight ? 'bg-zinc-900/50 backdrop-blur-md border-b border-zinc-800' : ''}`}>
        <div className="flex items-center space-x-2">
          <NotificationCenter align="left" />
        </div>
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center z-10">
          <h1 className={`text-2xl font-bold tracking-tighter italic drop-shadow-lg ${isPolarNight ? 'text-rose-50' : 'text-white'}`}>
            赞弹秀
          </h1>
          {isPolarNight && (
            <span className="text-[10px] font-black bg-rose-600 text-white px-2 py-0.5 rounded-full uppercase tracking-widest mt-0.5 shadow-lg shadow-rose-900/50">
              极夜限时战
            </span>
          )}
        </div>
        <button 
          onClick={() => user ? navigate('/profile') : signInWithGoogle()}
          className={`p-2 rounded-full transition-colors border ${isPolarNight ? 'bg-zinc-800 hover:bg-zinc-700 border-zinc-700' : 'bg-white/10 hover:bg-white/20 border-white/10'}`}
        >
          {user && user.photoURL ? (
            <img src={user.photoURL} alt="Avatar" className="w-8 h-8 rounded-full" referrerPolicy="no-referrer" />
          ) : (
            <UserIcon className="w-6 h-6 text-white/80" />
          )}
        </button>
      </header>

      {/* Polar Night Progress Bar */}
      {isPolarNight && (
        <div className="px-6 py-4 z-10 bg-zinc-900/80 backdrop-blur-sm border-b border-zinc-800">
          <div className="flex justify-between text-xs font-bold mb-2 uppercase tracking-wider">
            <span className="text-rose-500">红方阵营 (45%)</span>
            <span className="text-emerald-500">蓝方阵营 (55%)</span>
          </div>
          <div className="h-3 w-full bg-zinc-800 rounded-full overflow-hidden flex">
            <div className="h-full bg-rose-500 transition-all duration-1000" style={{ width: '45%' }}></div>
            <div className="h-full bg-emerald-500 transition-all duration-1000" style={{ width: '55%' }}></div>
          </div>
          <p className="text-center text-[10px] text-zinc-500 mt-2">参与极夜战，赢取「周末斗士」徽章及 3 倍匹配权重</p>
        </div>
      )}

      {/* Card Stack */}
      <main className="flex-1 flex items-center justify-center p-6 z-10 relative">
        {topics.length === 0 || currentIndex >= topics.length ? (
          <div className="text-center text-white/50">
            {isAutoFetching ? (
              <div className="flex flex-col items-center space-y-4">
                <Loader2 className="w-10 h-10 animate-spin text-indigo-500" />
                <p className="text-lg font-bold text-white">AI 正在全网抓取热点话题...</p>
                <p className="text-sm">请稍候，这可能需要几秒钟</p>
              </div>
            ) : (
              <>
                <p className="mb-6">暂无更多话题</p>
                <div className="flex flex-col space-y-4">
                  <button 
                    onClick={() => setIsModalOpen(true)}
                    className="px-6 py-3 bg-white/10 rounded-full text-white hover:bg-white/20 transition-colors"
                  >
                    手动发布话题
                  </button>
                </div>
              </>
            )}
          </div>
        ) : (
          <>
            <AnimatePresence mode="popLayout">
              {topics.map((topic, index) => {
              if (index < currentIndex || index > currentIndex + 2) return null;
              
              const isCurrent = index === currentIndex;
              const isNext = index === currentIndex + 1;

              return (
                <motion.div
                  key={topic.id}
                  style={isCurrent ? { x, rotate, opacity: dragOpacity } : {}}
                  drag={isCurrent ? "x" : false}
                  dragConstraints={{ left: 0, right: 0 }}
                  dragElastic={0.7}
                  onDragStart={() => {
                    isDraggingRef.current = true;
                    setIsDragging(true);
                  }}
                  onDragEnd={(e, info) => {
                    setTimeout(() => {
                      isDraggingRef.current = false;
                    }, 100);
                    setIsDragging(false);
                    if (cooldown) return;
                    if (info.offset.x > 100) {
                      handleVote('AGREE');
                    } else if (info.offset.x < -100) {
                      handleVote('DISAGREE');
                    }
                  }}
                  initial={{ scale: 0.9, y: 20, opacity: 0 }}
                  animate={{ 
                    scale: isCurrent ? 1 : 0.95, 
                    y: isCurrent ? 0 : 20, 
                    opacity: isCurrent ? 1 : (isNext ? 0.5 : 0),
                    zIndex: topics.length - index
                  }}
                  exit={{ 
                    x: swipeDirection === 'right' ? 300 : (swipeDirection === 'left' ? -300 : 0), 
                    opacity: 0, 
                    rotate: swipeDirection === 'right' ? 10 : (swipeDirection === 'left' ? -10 : 0) 
                  }}
                  transition={{ 
                    type: "spring", 
                    stiffness: 300, 
                    damping: 20,
                    opacity: { duration: 0.2 }
                  }}
                  className={`absolute w-full max-w-sm aspect-[3/4] ${isCurrent ? 'cursor-grab active:cursor-grabbing' : ''}`}
                >
                  <div
                    className={`w-full h-full rounded-[2rem] shadow-[0_20px_50px_rgba(0,0,0,0.5)] overflow-hidden flex flex-col border border-white/10 ${isCurrent ? 'transition-transform duration-300 ring-1 ring-white/20' : ''}`}
                  >
                    {/* Full Background Image */}
                  <div className="absolute inset-0 bg-gray-950">
                    <img 
                      src={`https://image.pollinations.ai/prompt/${encodeURIComponent((topic.image_keyword || 'news') + ' realistic photography, cinematic, highly detailed')}?width=600&height=800&nologo=true`} 
                      alt={topic.category || 'Topic'} 
                      className="w-full h-full object-cover pointer-events-none opacity-80 mix-blend-luminosity"
                      referrerPolicy="no-referrer"
                      loading="lazy"
                    />
                    {/* Rich Gradient Overlay for Depth and Text Readability */}
                    <div className="absolute inset-0 bg-gradient-to-b from-indigo-950/60 via-black/40 to-black/95 pointer-events-none" />
                  </div>

                  {/* Content Overlay */}
                  <div className="relative w-full h-full flex flex-col p-6 z-10 text-white justify-start gap-y-4">
                    {/* Top Section: Badge and Share */}
                    <div className="flex justify-between items-start w-full">
                      <div className="bg-gradient-to-r from-indigo-500 to-purple-500 text-white text-[11px] font-black px-4 py-1.5 rounded-full shadow-[0_0_15px_rgba(99,102,241,0.5)] border border-white/20 tracking-widest uppercase">
                        {topic.category || '争议话题'}
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="bg-black/40 backdrop-blur-md text-white text-[10px] font-bold px-3 py-1.5 rounded-full border border-white/10 flex items-center shadow-lg">
                          <span className="text-orange-400 mr-1">🔥</span>
                          {1200 + ((topic.agree_count || 0) + (topic.disagree_count || 0)) * 42} 人正在激辩
                        </div>
                        <button
                          onClick={(e) => handleShare(topic, e)}
                          className="p-2.5 bg-white/10 hover:bg-white/20 backdrop-blur-xl rounded-full text-white transition-all border border-white/10 shadow-lg"
                          title="分享"
                        >
                          <Share2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    
                    {/* Swipe Hints (Centered) */}
                    {isCurrent && (
                      <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: isDragging ? 0.9 : 0 }}
                        transition={{ duration: 0.2 }}
                        className="absolute inset-0 flex justify-between items-center px-4 pointer-events-none z-20"
                      >
                        <span className="text-rose-400 font-black text-3xl border-4 border-rose-500/50 rounded-2xl px-4 py-2 transform -rotate-12 bg-black/60 shadow-[0_0_30px_rgba(244,63,94,0.4)] backdrop-blur-md uppercase tracking-widest">反对</span>
                        <span className="text-emerald-400 font-black text-3xl border-4 border-emerald-500/50 rounded-2xl px-4 py-2 transform rotate-12 bg-black/60 shadow-[0_0_30px_rgba(16,185,129,0.4)] backdrop-blur-md uppercase tracking-widest">赞同</span>
                      </motion.div>
                    )}

                    {/* Center Section: Main Content */}
                    <div className="flex-1 flex flex-col py-2 pointer-events-none z-10 gap-4 overflow-hidden">
                      
                      {/* Statement & Hook (Top of center section) */}
                      <div className="flex flex-col gap-3 shrink-0">
                        <h2 className="text-2xl md:text-3xl font-extrabold leading-snug text-left text-transparent bg-clip-text bg-gradient-to-br from-white via-gray-100 to-gray-400 drop-shadow-lg tracking-tight">
                          {topic.statement}
                        </h2>
                        <p className="text-[13px] text-gray-200 bg-black/40 backdrop-blur-md px-4 py-2.5 rounded-xl border-l-4 border-indigo-500 shadow-sm leading-relaxed self-start">
                          {topic.hook || '面对效率高压与不可逾越的红线，这道题你怎么选？'}
                        </p>
                      </div>

                      {/* Scrollable Context & Perspectives */}
                      <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar w-full pointer-events-auto flex flex-col gap-4" onPointerDown={(e) => e.stopPropagation()}>
                        
                        {/* Dual Perspectives (Stacked for readability) */}
                        <div className="flex flex-col gap-2 shrink-0 pb-2">
                          <div className="bg-gradient-to-r from-emerald-500/10 to-transparent border-l-2 border-emerald-500 rounded-r-xl p-3 backdrop-blur-md relative overflow-hidden">
                            <div className="absolute right-2 -top-4 text-6xl text-emerald-500/10 font-serif">"</div>
                            <span className="text-[11px] text-emerald-400 font-bold mb-1 flex items-center uppercase tracking-wider">
                              <ThumbsUp className="w-3.5 h-3.5 mr-1.5" /> 挺方观点
                            </span>
                            <p className="text-[12px] text-gray-200 leading-relaxed relative z-10">
                              {topic.perspective_agree || '顺应趋势，效率至上，技术迭代带来的红利不可逆。'}
                            </p>
                          </div>
                          <div className="bg-gradient-to-l from-rose-500/10 to-transparent border-r-2 border-rose-500 rounded-l-xl p-3 backdrop-blur-md relative overflow-hidden text-right flex flex-col items-end">
                            <div className="absolute left-2 -top-4 text-6xl text-rose-500/10 font-serif">"</div>
                            <span className="text-[11px] text-rose-400 font-bold mb-1 flex items-center justify-end uppercase tracking-wider">
                              踩方观点 <ThumbsDown className="w-3.5 h-3.5 ml-1.5" />
                            </span>
                            <p className="text-[12px] text-gray-200 leading-relaxed relative z-10 text-right">
                              {topic.perspective_disagree || '坚守底线，人文关怀，潜在的伦理与法律风险不容忽视。'}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Bottom Section: Tags & Action */}
                    <div className="mt-auto pt-2 flex flex-col gap-4 z-10 shrink-0">
                      {/* Tags */}
                      {topic.tags && topic.tags.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {topic.tags.map((tag: string, i: number) => (
                            <span key={i} className="text-[10px] font-bold px-3 py-1.5 rounded-full bg-white/10 backdrop-blur-md text-gray-200 border border-white/10 shadow-inner uppercase tracking-wider">
                              #{tag}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Invest Button */}
                      {isCurrent && ((topic.agree_count || 0) + (topic.disagree_count || 0) < 100) && (
                        <div className="flex justify-center mt-1">
                          <button
                            onClick={(e) => handleInvest(topic.id, e)}
                            disabled={investingTopicId === topic.id}
                            className="group flex items-center space-x-2 px-6 py-3 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-full text-sm font-black shadow-[0_0_20px_rgba(245,158,11,0.4)] border border-amber-300/50 hover:shadow-[0_0_25px_rgba(245,158,11,0.6)] hover:scale-105 transition-all disabled:opacity-50 disabled:hover:scale-100 w-full justify-center"
                          >
                            {investingTopicId === topic.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Coins className="w-4 h-4 group-hover:rotate-12 transition-transform" />
                            )}
                            <span className="tracking-wide">参与押宝，瓜分 1000 积分</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
          
          {/* Swipe Hint */}
          {topics.length > 0 && currentIndex < topics.length && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="absolute bottom-6 left-0 w-full flex justify-center pointer-events-none z-0"
            >
              <div className="bg-black/40 backdrop-blur-md px-5 py-2.5 rounded-full border border-white/10 flex items-center gap-4 text-white/80 text-sm font-bold tracking-widest shadow-lg">
                <span className="animate-pulse flex items-center gap-1"><span className="text-rose-400">👈</span> 左滑反对</span>
                <div className="w-1.5 h-1.5 bg-white/30 rounded-full"></div>
                <span className="animate-pulse flex items-center gap-1">右滑赞同 <span className="text-emerald-400">👉</span></span>
              </div>
            </motion.div>
          )}
          </>
        )}
      </main>

      {/* Combo Animation Overlay */}
      <AnimatePresence>
        {showCombo && (
          <motion.div
            initial={{ scale: 0.5, opacity: 0, rotate: -10 }}
            animate={{ scale: 1.2, opacity: 1, rotate: 0 }}
            exit={{ scale: 2, opacity: 0, filter: "blur(10px)" }}
            transition={{ type: "spring", bounce: 0.6 }}
            className="absolute inset-0 z-50 flex items-center justify-center pointer-events-none"
          >
            <div className="text-center">
              <h1 className="text-7xl font-black text-transparent bg-clip-text bg-gradient-to-br from-amber-300 to-orange-600 drop-shadow-[0_5px_5px_rgba(0,0,0,0.5)] italic tracking-tighter">
                COMBO
              </h1>
              <p className="text-5xl font-black text-white drop-shadow-lg mt-2">x{comboCount}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Action Buttons */}
      <footer className="p-8 z-10 flex justify-center space-x-8">
        <motion.button
          initial={{ backgroundImage: "linear-gradient(135deg, #ffffff 0%, #ffffff 100%)" }}
          whileHover={{ scale: 1.05, backgroundImage: "linear-gradient(135deg, #fff1f2 0%, #ffe4e6 100%)" }}
          whileTap={{ scale: 1.2, backgroundImage: "linear-gradient(135deg, #fecdd3 0%, #fda4af 100%)" }}
          onClick={() => handleVote('DISAGREE')}
          disabled={topics.length === 0 || currentIndex >= topics.length || cooldown}
          className="w-20 h-20 rounded-full flex items-center justify-center shadow-lg group disabled:opacity-50 disabled:cursor-not-allowed disabled:grayscale"
        >
          <ThumbsDown className="w-10 h-10 text-rose-500 group-hover:text-rose-600 group-active:text-rose-700 transition-colors" />
        </motion.button>
        <motion.button
          initial={{ backgroundImage: "linear-gradient(135deg, #ffffff 0%, #ffffff 100%)" }}
          whileHover={{ scale: 1.05, backgroundImage: "linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)" }}
          whileTap={{ scale: 1.2, backgroundImage: "linear-gradient(135deg, #a7f3d0 0%, #6ee7b7 100%)" }}
          onClick={() => handleVote('AGREE')}
          disabled={topics.length === 0 || currentIndex >= topics.length || cooldown}
          className="w-20 h-20 rounded-full flex items-center justify-center shadow-lg group disabled:opacity-50 disabled:cursor-not-allowed disabled:grayscale"
        >
          <ThumbsUp className="w-10 h-10 text-emerald-500 group-hover:text-emerald-600 group-active:text-emerald-700 transition-colors" />
        </motion.button>
      </footer>

      {/* Floating Action Button */}
      <button
        onClick={() => setIsModalOpen(true)}
        className="absolute bottom-8 right-8 z-40 w-14 h-14 bg-indigo-600 text-white rounded-full flex items-center justify-center shadow-[0_8px_30px_rgb(0,0,0,0.3)] hover:bg-indigo-500 hover:scale-110 active:scale-95 transition-all"
      >
        <Plus className="w-6 h-6" />
      </button>

      {/* Input Modal / Bottom Sheet */}
      <AnimatePresence>
        {isModalOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !isGenerating && setIsModalOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm z-50"
            />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="absolute bottom-0 left-0 w-full bg-white rounded-t-3xl p-6 z-50 shadow-2xl"
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-gray-900">投喂新话题</h3>
                <button 
                  onClick={() => !isGenerating && setIsModalOpen(false)}
                  className="p-2 rounded-full hover:bg-gray-100 text-gray-500"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="space-y-4">
                {recommendedTags.length > 0 && (
                  <div className="mb-2">
                    <span className="text-xs text-gray-500 mb-2 block">推荐话题标签：</span>
                    <div className="flex flex-wrap gap-2">
                      {recommendedTags.map(tag => (
                        <button
                          key={tag}
                          onClick={() => setContent(prev => prev + (prev ? ' ' : '') + `#${tag} `)}
                          className="text-xs bg-indigo-50 text-indigo-600 px-3 py-1.5 rounded-full border border-indigo-100 hover:bg-indigo-100 transition-colors"
                        >
                          #{tag}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="输入新闻链接或一句话快讯，AI 为你提炼争议话题..."
                  className="w-full h-32 p-4 text-gray-800 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
                  disabled={isGenerating}
                />
                <button
                  onClick={handleGenerate}
                  disabled={isGenerating || !content.trim()}
                  className="w-full flex items-center justify-center py-4 px-6 bg-indigo-600 text-white font-semibold rounded-2xl shadow-md hover:bg-indigo-700 disabled:opacity-70 transition-all active:scale-[0.98]"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                      AI 正在解析核心矛盾...
                    </>
                  ) : (
                    <>
                      <Zap className="w-5 h-5 mr-2" />
                      一键投喂生成
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Decorative Background */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none z-0">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-indigo-500 rounded-full filter blur-[100px] opacity-20"></div>
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-rose-500 rounded-full filter blur-[100px] opacity-20"></div>
      </div>
    </div>
  );
}
