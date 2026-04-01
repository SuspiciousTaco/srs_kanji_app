import React, { useState, useEffect, useMemo } from 'react';
import { BookOpen, GraduationCap, ArrowRight, Check, X, Loader2, Save } from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, setDoc, onSnapshot } from 'firebase/firestore';

// --- FIREBASE INITIALIZATION ---
// In your actual GitHub project, you will replace these with your own Firebase config variables.
// The code below uses environment variables provided by this sandbox, with fallbacks for your local setup.
const firebaseConfig = {
  apiKey: "AIzaSyBg0TS7T4HdV_d1XfhYAE-PaVzyHgzw8CE",
  authDomain: "web-kanji-srs.firebaseapp.com",
  projectId: "web-kanji-srs",
  storageBucket: "web-kanji-srs.firebasestorage.app",
  messagingSenderId: "131146137850",
  appId: "1:131146137850:web:0789cf3ebe3e9d3b2e4943",
  measurementId: "G-DE974KLLB9"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'kitaku-kanji-srs';

// --- CURRICULUM DATA ---
// In a production app, fetch this from a data.json file. For simplicity here, it's a constant.
const ITEM_DB = [
  { id: 'k_ku', type: 'kanji', char: '区', meanings: ['ward', 'district'], readings: ['く'], meaningMnemonic: 'This box has a giant X in it. It marks your specific ward or district on the map.', readingMnemonic: 'Which district do you live in? Kita-ku (く).' },
  { id: 'k_yaku', type: 'kanji', char: '役', meanings: ['duty', 'service', 'role'], readings: ['やく'], meaningMnemonic: 'You are walking with a weapon to do your duty and public service.', readingMnemonic: 'Public service gives you a lot of yak (やく) to deal with.' },
  { id: 'k_sho', type: 'kanji', char: '所', meanings: ['place'], readings: ['しょ', 'ところ'], meaningMnemonic: 'A door and an axe. This is the place where you chop wood.', readingMnemonic: 'This place is where the shogun (しょ) lives.' },
  { id: 'v_kuyakusho', type: 'vocabulary', char: '区役所', meanings: ['ward office'], readings: ['くやくしょ'], meaningMnemonic: 'Ward + Service + Place = Ward Office. The place you go to do paperwork in Kita-ku.', readingMnemonic: 'Uses the onyomi readings you just learned: く + やく + しょ.' },
  { id: 'k_ho', type: 'kanji', char: '保', meanings: ['protect', 'preserve'], readings: ['ほ'], meaningMnemonic: 'A person keeping a mouth safe on a tree. They are protecting it.', readingMnemonic: 'You protect the ho (ほ)ly relics.' },
  { id: 'k_iku', type: 'kanji', char: '育', meanings: ['raise', 'bring up', 'grow'], readings: ['いく'], meaningMnemonic: 'The moon is raising the child on its head.', readingMnemonic: 'Raising a child gives you a lot of icky (いく) messes to clean up.' },
  { id: 'k_en', type: 'kanji', char: '園', meanings: ['park', 'garden'], readings: ['えん'], meaningMnemonic: 'A walled enclosure with a long robe inside. It is a beautiful enclosed garden.', readingMnemonic: 'At the end (えん) of the street is a beautiful park.' },
  { id: 'v_hoikuen', type: 'vocabulary', char: '保育園', meanings: ['nursery school'], readings: ['ほいくえん'], meaningMnemonic: 'Protect + Raise + Garden = Nursery School. The garden where they protect and raise your kids.', readingMnemonic: 'Uses the onyomi: ほ + いく + えん.' }
];

const SRS_INTERVALS = [0, 4*3600000, 8*3600000, 24*3600000, 48*3600000, 168*3600000, 336*3600000, 720*3600000, 2880*3600000, null];

// --- MAIN APP COMPONENT ---
export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState({});
  const [view, setView] = useState('dashboard');
  const [queue, setQueue] = useState([]);
  const [syncStatus, setSyncStatus] = useState('synced'); // 'synced', 'syncing', 'error'

  // 1. Initialize Authentication (Rule 3)
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (error) {
        console.error("Auth Error:", error);
      }
    };
    initAuth();
    
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (!currentUser) setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // 2. Setup Real-time Firestore Sync
  useEffect(() => {
    if (!user) return;
    
    // Path: artifacts/{appId}/users/{userId}/progress/main (Follows Rule 1)
    const docRef = doc(db, 'artifacts', appId, 'users', user.uid, 'progress', 'main');
    
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        setProgress(docSnap.data());
      } else {
        // First time user, initialize data
        const initData = {};
        ITEM_DB.forEach(item => {
          initData[item.id] = { stage: 0, nextReview: null, unlocked: true };
        });
        setProgress(initData);
        saveToFirebase(initData);
      }
      setLoading(false);
    }, (error) => {
      console.error("Firestore Listen Error:", error);
      setSyncStatus('error');
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  // 3. Save Function
  const saveToFirebase = async (newProgress) => {
    if (!user) return;
    setSyncStatus('syncing');
    try {
      const docRef = doc(db, 'artifacts', appId, 'users', user.uid, 'progress', 'main');
      await setDoc(docRef, newProgress, { merge: true });
      setSyncStatus('synced');
    } catch (error) {
      console.error("Error saving:", error);
      setSyncStatus('error');
    }
  };

  // Derived metrics
  const lessonsAvailable = useMemo(() => {
    return ITEM_DB.filter(item => progress[item.id]?.stage === 0 && progress[item.id]?.unlocked);
  }, [progress]);

  const reviewsAvailable = useMemo(() => {
    const now = Date.now();
    return ITEM_DB.filter(item => {
      const p = progress[item.id];
      return p && p.stage > 0 && p.stage < 9 && p.nextReview <= now;
    });
  }, [progress]);

  // Handlers
  const startLessons = () => { setQueue([...lessonsAvailable]); setView('lessons'); };
  
  const startReviews = () => {
    const reviewQueue = [];
    reviewsAvailable.forEach(item => {
      reviewQueue.push({ ...item, qType: 'meaning' });
      reviewQueue.push({ ...item, qType: 'reading' });
    });
    // Shuffle (Fisher-Yates)
    for (let i = reviewQueue.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [reviewQueue[i], reviewQueue[j]] = [reviewQueue[j], reviewQueue[i]];
    }
    setQueue(reviewQueue);
    setView('reviews');
  };

  const finishSession = async (updates) => {
    const newProgress = { ...progress, ...updates };
    // Optimistic UI update
    setProgress(newProgress); 
    setView('dashboard');
    // Persist to Cloud
    await saveToFirebase(updates); 
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-stone-100 flex items-center justify-center text-stone-600">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="animate-spin" size={32} />
          <p className="font-medium tracking-wide">Connecting to Cloud Database...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-100 text-stone-800 font-sans selection:bg-stone-300">
      <header className="bg-stone-900 text-stone-50 p-4 shadow-md flex justify-between items-center sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
            <BookOpen size={24} /> Kita-Ku SRS
          </h1>
          {syncStatus === 'syncing' && <Loader2 size={16} className="animate-spin text-stone-400" />}
          {syncStatus === 'synced' && <Save size={16} className="text-green-400" title="All progress saved to cloud" />}
          {syncStatus === 'error' && <X size={16} className="text-red-400" title="Sync error" />}
        </div>
        {view !== 'dashboard' && (
          <button onClick={() => setView('dashboard')} className="text-sm bg-stone-800 hover:bg-stone-700 px-3 py-1.5 rounded transition-colors font-medium">
            Quit Session
          </button>
        )}
      </header>

      <main className="max-w-4xl mx-auto p-4 md:p-8">
        {view === 'dashboard' && (
          <Dashboard lessons={lessonsAvailable} reviews={reviewsAvailable} onStartLessons={startLessons} onStartReviews={startReviews} userId={user?.uid} />
        )}
        {view === 'lessons' && <LessonSession queue={queue} onComplete={finishSession} />}
        {view === 'reviews' && <ReviewSession queue={queue} progressData={progress} onComplete={finishSession} />}
      </main>
    </div>
  );
}

// --- SUBCOMPONENTS ---

function Dashboard({ lessons, reviews, onStartLessons, onStartReviews, userId }) {
  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-sm shadow-sm border border-stone-200 p-8 flex flex-col items-center justify-center text-center">
          <div className="w-16 h-16 bg-stone-100 text-stone-700 rounded-full flex items-center justify-center mb-4 shadow-inner">
            <GraduationCap size={32} />
          </div>
          <h2 className="text-2xl font-bold mb-1 text-stone-800">Lessons</h2>
          <p className="text-stone-500 mb-6 font-medium">{lessons.length} available</p>
          <button onClick={onStartLessons} disabled={lessons.length === 0} className="w-full bg-stone-800 hover:bg-stone-900 disabled:bg-stone-300 disabled:cursor-not-allowed text-white font-semibold py-3 px-6 rounded-sm transition-colors flex items-center justify-center gap-2">
            Start Lessons <ArrowRight size={18} />
          </button>
        </div>

        <div className="bg-white rounded-sm shadow-sm border border-stone-200 p-8 flex flex-col items-center justify-center text-center">
          <div className="w-16 h-16 bg-stone-800 text-stone-100 rounded-full flex items-center justify-center mb-4 shadow-inner">
            <BookOpen size={32} />
          </div>
          <h2 className="text-2xl font-bold mb-1 text-stone-800">Reviews</h2>
          <p className="text-stone-500 mb-6 font-medium">{reviews.length} available</p>
          <button onClick={onStartReviews} disabled={reviews.length === 0} className="w-full bg-stone-800 hover:bg-stone-900 disabled:bg-stone-300 disabled:cursor-not-allowed text-white font-semibold py-3 px-6 rounded-sm transition-colors flex items-center justify-center gap-2">
            Start Reviews <ArrowRight size={18} />
          </button>
        </div>
      </div>

      <div className="mt-8 text-center text-xs text-stone-400 font-mono">
        Device Auth ID: {userId || 'Authenticating...'}
      </div>
    </div>
  );
}

function LessonSession({ queue, onComplete }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [completedIds, setCompletedIds] = useState([]);
  const item = queue[currentIndex];
  
  const handleNext = () => {
    setCompletedIds(prev => [...prev, item.id]);
    if (currentIndex < queue.length - 1) {
      setCurrentIndex(prev => prev + 1);
    } else {
      const updates = {};
      const now = Date.now();
      [...completedIds, item.id].forEach(id => {
        updates[id] = { stage: 1, nextReview: now + SRS_INTERVALS[1], unlocked: true };
      });
      onComplete(updates);
    }
  };

  const isVocab = item.type === 'vocabulary';

  return (
    <div className="max-w-2xl mx-auto bg-white shadow-sm border border-stone-200 overflow-hidden animate-in slide-in-from-bottom-4 duration-300 rounded-sm">
      <div className={`p-16 flex justify-center items-center ${isVocab ? 'bg-indigo-600' : 'bg-pink-600'} text-white`}>
        <span className="text-8xl font-serif tracking-widest">{item.char}</span>
      </div>
      
      <div className="p-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-3xl font-bold capitalize text-stone-800">{item.meanings.join(', ')}</h2>
          <span className="px-3 py-1 text-xs font-bold uppercase tracking-wider rounded-sm bg-stone-100 text-stone-600 border border-stone-200">
            {item.type}
          </span>
        </div>

        <div className="mb-6">
          <h3 className="text-sm font-bold text-stone-400 uppercase tracking-wider mb-2">Readings</h3>
          <p className="text-2xl font-medium text-stone-800">{item.readings.join(', ')}</p>
        </div>

        <div className="mb-6 bg-stone-50 p-4 rounded-sm border border-stone-100">
          <h3 className="text-sm font-bold text-stone-500 uppercase tracking-wider mb-2">Meaning Mnemonic</h3>
          <p className="text-stone-700 leading-relaxed">{item.meaningMnemonic}</p>
        </div>

        <div className="mb-8 bg-stone-50 p-4 rounded-sm border border-stone-100">
          <h3 className="text-sm font-bold text-stone-500 uppercase tracking-wider mb-2">Reading Mnemonic</h3>
          <p className="text-stone-700 leading-relaxed">{item.readingMnemonic}</p>
        </div>

        <div className="flex justify-between items-center pt-6 border-t border-stone-100">
          <span className="text-sm text-stone-500 font-medium">Lesson {currentIndex + 1} of {queue.length}</span>
          <button onClick={handleNext} className="bg-stone-900 hover:bg-stone-800 text-white px-8 py-3 rounded-sm font-semibold transition-colors flex items-center gap-2">
            {currentIndex < queue.length - 1 ? 'Next Item' : 'Finish Lessons'} <ArrowRight size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}

function ReviewSession({ queue, progressData, onComplete }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [input, setInput] = useState('');
  const [showAnswer, setShowAnswer] = useState(false);
  const [isCorrect, setIsCorrect] = useState(null);
  const [performance, setPerformance] = useState({});

  if (queue.length === 0 || currentIndex >= queue.length) {
    return <SessionSummary performance={performance} queue={queue} progressData={progressData} onComplete={onComplete} />;
  }

  const item = queue[currentIndex];
  const qType = item.qType;
  const isVocab = item.type === 'vocabulary';
  const normalizeStr = (str) => str.toLowerCase().trim();

  const handleSubmit = (e) => {
    e.preventDefault();
    if (showAnswer) {
      setInput(''); setShowAnswer(false); setIsCorrect(null); setCurrentIndex(prev => prev + 1);
      return;
    }

    const val = normalizeStr(input);
    const correct = qType === 'meaning' 
      ? item.meanings.some(m => normalizeStr(m) === val)
      : item.readings.some(r => normalizeStr(r) === val);

    setIsCorrect(correct);
    setShowAnswer(true);

    if (!correct) {
      setPerformance(prev => {
        const p = prev[item.id] || { mistakes: 0 };
        return { ...prev, [item.id]: { mistakes: p.mistakes + 1 } };
      });
    } else {
      setPerformance(prev => prev[item.id] ? prev : { ...prev, [item.id]: { mistakes: 0 } });
    }
  };

  return (
    <div className="max-w-2xl mx-auto mt-4">
      <div className="flex justify-between items-center mb-4 text-sm font-bold text-stone-500 uppercase tracking-wide">
        <span>Review {currentIndex + 1} / {queue.length}</span>
        <span>{qType}</span>
      </div>

      <div className={`rounded-t-sm p-20 flex justify-center items-center shadow-sm relative overflow-hidden ${isVocab ? 'bg-indigo-600' : 'bg-pink-600'} text-white`}>
        <span className="text-8xl font-serif tracking-widest z-10">{item.char}</span>
      </div>

      <form onSubmit={handleSubmit} className="relative shadow-md rounded-b-sm overflow-hidden border-x border-b border-stone-200">
        <input 
          type="text" autoFocus value={input} onChange={(e) => setInput(e.target.value)} disabled={showAnswer}
          placeholder={qType === 'reading' ? "Type reading in Hiragana" : "Type English meaning"}
          className={`w-full text-center text-2xl p-6 outline-none transition-colors font-medium ${
            showAnswer 
              ? isCorrect ? 'bg-green-500 text-white placeholder-green-200' : 'bg-red-500 text-white placeholder-red-200'
              : 'bg-white text-stone-900 focus:bg-stone-50 placeholder-stone-300'
          }`}
        />
        {showAnswer && (
          <button type="submit" className="absolute right-4 top-1/2 -translate-y-1/2 p-2 bg-black/20 hover:bg-black/30 text-white rounded-sm transition-colors">
            <ArrowRight size={24} />
          </button>
        )}
      </form>

      {showAnswer && !isCorrect && (
        <div className="mt-6 bg-white rounded-sm p-6 shadow-sm border border-red-200 animate-in fade-in slide-in-from-top-4">
          <h3 className="text-red-600 font-bold mb-4 flex items-center gap-2">
            <X size={20} /> Correct Answer: <span className="text-stone-900 font-normal">{qType === 'meaning' ? item.meanings.join(', ') : item.readings.join(', ')}</span>
          </h3>
          <div className="bg-stone-50 p-4 rounded-sm border border-stone-100">
            <h4 className="text-xs font-bold text-stone-400 uppercase tracking-wider mb-1">Mnemonic</h4>
            <p className="text-stone-700">{qType === 'meaning' ? item.meaningMnemonic : item.readingMnemonic}</p>
          </div>
        </div>
      )}
    </div>
  );
}

function SessionSummary({ performance, queue, progressData, onComplete }) {
  const uniqueItems = Array.from(new Set(queue.map(q => q.id)));
  const updates = {};
  let correctCount = 0;

  uniqueItems.forEach(id => {
    const mistakes = performance[id]?.mistakes || 0;
    const currentStage = progressData[id].stage;
    
    let newStage;
    if (mistakes === 0) {
      newStage = Math.min(currentStage + 1, 9);
      correctCount++;
    } else {
      const penalty = Math.ceil(mistakes / 2); 
      newStage = Math.max(currentStage - penalty, 1);
    }

    updates[id] = { stage: newStage, nextReview: newStage === 9 ? null : Date.now() + SRS_INTERVALS[newStage], unlocked: true };
  });

  const accuracy = Math.round((correctCount / uniqueItems.length) * 100) || 0;

  return (
    <div className="max-w-2xl mx-auto bg-white rounded-sm shadow-sm border border-stone-200 p-10 text-center animate-in zoom-in-95 duration-300">
      <h2 className="text-3xl font-bold mb-2 text-stone-800">Session Complete</h2>
      <p className="text-stone-500 mb-8 font-medium">Progress securely saved to cloud.</p>

      <div className="grid grid-cols-2 gap-6 mb-10">
        <div className="bg-stone-50 rounded-sm p-6 border border-stone-100">
          <div className="text-5xl font-bold text-stone-800 mb-2">{uniqueItems.length}</div>
          <div className="text-xs font-bold text-stone-400 uppercase tracking-wider">Items Reviewed</div>
        </div>
        <div className="bg-stone-50 rounded-sm p-6 border border-stone-100">
          <div className="text-5xl font-bold text-stone-800 mb-2">{accuracy}%</div>
          <div className="text-xs font-bold text-stone-400 uppercase tracking-wider">Accuracy</div>
        </div>
      </div>

      <button onClick={() => onComplete(updates)} className="bg-stone-900 hover:bg-stone-800 text-white font-semibold py-4 px-8 rounded-sm transition-colors inline-flex items-center gap-2">
        <Check size={20} /> Return to Dashboard
      </button>
    </div>
  );
}
