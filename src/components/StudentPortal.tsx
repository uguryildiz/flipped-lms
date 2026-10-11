import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Send,
  CheckCircle2,
  AlertCircle,
  FileText,
  Clock,
  HelpCircle,
  Trophy,
  ArrowRight,
  BookOpen,
  Sparkles,
  RefreshCw,
  LogOut,
  ShieldCheck,
  Check,
  Lock,
  ListOrdered,
  RotateCcw,
  Pencil,
  Trash2,
  X,
} from 'lucide-react';
import { AikenQuestion, QuizAnswer, SessionInfo } from '../types';
import { apiFetch, safeJson } from '../utils/api';

interface StudentPortalProps {
  initialSessionCode?: string;
  onExit?: () => void;
}

export const StudentPortal: React.FC<StudentPortalProps> = ({
  initialSessionCode = '',
  onExit,
}) => {
  // Load saved student session from localStorage
  const savedStudentSession = (() => {
    try {
      const stored = localStorage.getItem('edu_student_session');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  })();

  // Login / Session join state
  const [sessionCode, setSessionCode] = useState<string>(
    savedStudentSession?.sessionCode || initialSessionCode || ''
  );
  const [studentNo, setStudentNo] = useState<string>(
    savedStudentSession?.studentNo || ''
  );
  const [studentName, setStudentName] = useState<string>(
    savedStudentSession?.studentName || ''
  );
  const [isJoined, setIsJoined] = useState<boolean>(
    Boolean(
      savedStudentSession?.isJoined &&
      savedStudentSession?.studentNo &&
      savedStudentSession?.studentName &&
      savedStudentSession?.sessionCode
    )
  );
  const [joinError, setJoinError] = useState('');
  const [isLoadingSession, setIsLoadingSession] = useState(false);

  // Active session data
  const [session, setSession] = useState<SessionInfo | null>(null);

  // Question upload state
  const [selectedTopic, setSelectedTopic] = useState('');

  // Single question form inputs (Question + 5 Options + Correct Answer)
  const [formQuestion, setFormQuestion] = useState('');
  const [formOptionA, setFormOptionA] = useState('');
  const [formOptionB, setFormOptionB] = useState('');
  const [formOptionC, setFormOptionC] = useState('');
  const [formOptionD, setFormOptionD] = useState('');
  const [formOptionE, setFormOptionE] = useState('');
  const [formAnswer, setFormAnswer] = useState<'A' | 'B' | 'C' | 'D' | 'E'>('A');

  const [isSubmittingQuestion, setIsSubmittingQuestion] = useState(false);
  const [submitSuccessMsg, setSubmitSuccessMsg] = useState('');
  const [submitErrorMsg, setSubmitErrorMsg] = useState('');

  // Question Edit & Delete state
  const [editingQuestion, setEditingQuestion] = useState<AikenQuestion | null>(null);
  const [editTopic, setEditTopic] = useState('');
  const [editQuestionText, setEditQuestionText] = useState('');
  const [editOptionA, setEditOptionA] = useState('');
  const [editOptionB, setEditOptionB] = useState('');
  const [editOptionC, setEditOptionC] = useState('');
  const [editOptionD, setEditOptionD] = useState('');
  const [editOptionE, setEditOptionE] = useState('');
  const [editAnswer, setEditAnswer] = useState<'A' | 'B' | 'C' | 'D' | 'E'>('A');
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [editErrorMsg, setEditErrorMsg] = useState('');

  const [deletingQuestion, setDeletingQuestion] = useState<AikenQuestion | null>(null);
  const [isDeletingQuestion, setIsDeletingQuestion] = useState(false);
  const [actionSuccessBanner, setActionSuccessBanner] = useState('');

  // Live quiz state
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [isSubmittingAnswer, setIsSubmittingAnswer] = useState(false);
  const [submitAnswerWarning, setSubmitAnswerWarning] = useState('');
  const trackedQuestionIndexRef = useRef<number | null>(null);

  // Fetch session details
  const fetchSession = async (codeToFetch = sessionCode) => {
    if (!codeToFetch || codeToFetch.length !== 5) return null;
    try {
      const res = await apiFetch(`/api/sessions/${codeToFetch}`);
      if (res.ok) {
        const data = await safeJson<SessionInfo>(res);
        if (data) {
          setSession(data);
          if (data.topics && data.topics.length > 0) {
            setSelectedTopic((prev) => (prev && data.topics.includes(prev) ? prev : data.topics[0]));
          }
          return data;
        }
      }

      // Check localStorage if backend is offline or static Netlify deployment
      try {
        const stored = localStorage.getItem('edu_last_session');
        if (stored) {
          const localData: SessionInfo = JSON.parse(stored);
          if (localData && localData.code === codeToFetch) {
            setSession(localData);
            if (localData.topics && localData.topics.length > 0) {
              setSelectedTopic((prev) => (prev && localData.topics.includes(prev) ? prev : localData.topics[0]));
            }
            return localData;
          }
        }
      } catch {}

      if (!res.ok) {
        if (res.status === 404) {
          setSession(null);
          return null;
        }
        const data = await safeJson<{ error?: string }>(res);
        throw new Error(data?.error || 'Oturum bulunamadı.');
      }
      setSession(null);
      return null;
    } catch (err: unknown) {
      // Local fallback on network error
      try {
        const stored = localStorage.getItem('edu_last_session');
        if (stored) {
          const localData: SessionInfo = JSON.parse(stored);
          if (localData && localData.code === codeToFetch) {
            setSession(localData);
            return localData;
          }
        }
      } catch {}
      setSession(null);
      throw err;
    }
  };

  // Auto-restore session if saved in localStorage
  useEffect(() => {
    if (savedStudentSession?.isJoined && savedStudentSession?.sessionCode) {
      fetchSession(savedStudentSession.sessionCode)
        .then((data) => {
          if (!data) {
            setIsJoined(false);
            try {
              localStorage.removeItem('edu_student_session');
            } catch {}
          }
        })
        .catch(() => {
          setIsJoined(false);
          try {
            localStorage.removeItem('edu_student_session');
          } catch {}
        });
    }
  }, []);

  // Join session handler
  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    setJoinError('');
    if (sessionCode.trim().length !== 5) {
      setJoinError('Lütfen 5 haneli geçerli oturum kodunu giriniz.');
      return;
    }
    const cleanStudentNo = studentNo.trim();
    if (!cleanStudentNo) {
      setJoinError('Lütfen 9 haneli öğrenci numaranızı giriniz.');
      return;
    }
    if (!/^\d{9}$/.test(cleanStudentNo)) {
      setJoinError('Öğrenci numarası sadece rakamlardan oluşan 9 haneli bir numara olmalıdır.');
      return;
    }
    const cleanStudentName = studentName.trim();
    if (!cleanStudentName) {
      setJoinError('Lütfen Ad ve Soyadınızı giriniz.');
      return;
    }
    if (cleanStudentName.length < 3) {
      setJoinError('Lütfen geçerli bir Ad ve Soyad giriniz (en az 3 karakter).');
      return;
    }

    setIsLoadingSession(true);
    try {
      const data = await fetchSession(sessionCode.trim());
      if (data) {
        setIsJoined(true);
        try {
          localStorage.setItem(
            'edu_student_session',
            JSON.stringify({
              sessionCode: sessionCode.trim(),
              studentNo: studentNo.trim(),
              studentName: studentName.trim(),
              isJoined: true,
            })
          );
        } catch {}
      } else {
        setJoinError('Oturum bulunamadı. Lütfen 5 haneli oturum kodunu kontrol ediniz.');
      }
    } catch (err: unknown) {
      setJoinError(err instanceof Error ? err.message : 'Oturuma bağlanılamadı.');
    } finally {
      setIsLoadingSession(false);
    }
  };

  // Leave / Logout from session
  const handleLeaveSession = () => {
    try {
      localStorage.removeItem('edu_student_session');
    } catch {}
    setIsJoined(false);
    setSession(null);
  };

  // Real-time polling while in session (Polled smoothly at 2500ms to avoid network storms)
  useEffect(() => {
    if (!isJoined || !sessionCode) return;

    let isPolling = false;
    const interval = setInterval(async () => {
      if (isPolling) return;
      isPolling = true;
      try {
        const res = await apiFetch(`/api/sessions/${sessionCode}`);
        if (res.ok) {
          const updated = await safeJson<SessionInfo>(res);
          if (updated) {
            setSession(updated);

            // Manage quiz question transition
            if (updated.status === 'quiz_active') {
              const activeIndex = updated.quizState.activeQuestionIndex;
              // Only synchronize answer selection when the question actually changes
              if (trackedQuestionIndexRef.current !== activeIndex) {
                trackedQuestionIndexRef.current = activeIndex;

                const selectedQuestions = updated.questions.filter((q) => q.selectionStatus === 'Seçildi');
                const currentQ = selectedQuestions[activeIndex];
                if (currentQ) {
                  const myAnswersForQ = updated.answers?.filter(
                    (a) => a.questionId === currentQ.id && a.studentNo.trim() === studentNo.trim()
                  ) || [];

                  if (myAnswersForQ.length > 0) {
                    setSelectedOption(myAnswersForQ[myAnswersForQ.length - 1].givenAnswer);
                  } else {
                    setSelectedOption(null);
                  }
                } else {
                  setSelectedOption(null);
                }
                setSubmitAnswerWarning('');
              }
            } else {
              trackedQuestionIndexRef.current = null;
            }
          }
        } else if (res.status === 404) {
          setIsJoined(false);
          setSession(null);
          try {
            localStorage.removeItem('edu_student_session');
          } catch {}
        }
      } catch (e) {
        // silent polling catch
      } finally {
        isPolling = false;
      }
    }, 2500);

    return () => clearInterval(interval);
  }, [isJoined, sessionCode, studentNo]);

  // Filter questions submitted by this student
  const mySubmittedQuestions =
    session?.questions.filter((q) => q.studentNo === studentNo.trim()) || [];

  const maxQuestionsLimit = session?.maxQuestionsPerStudent || 1;
  const questionsSubmittedCount = mySubmittedQuestions.length;
  const remainingQuestionsCount = Math.max(0, maxQuestionsLimit - questionsSubmittedCount);
  const isQuestionLimitReached = questionsSubmittedCount >= maxQuestionsLimit;

  // Konu başına soru sorma sınırı (Özel konu ayarı varsa onu, yoksa oturum varsayılanını kullanır)
  const getTopicLimit = (topicName: string): number => {
    const clean = (topicName || '').trim();
    const cfg = session?.topicConfigs?.[clean];
    if (cfg && typeof cfg.maxQuestionsLimit === 'number' && cfg.maxQuestionsLimit > 0) {
      return cfg.maxQuestionsLimit;
    }
    return session?.maxQuestionsPerTopicPerStudent || 1;
  };

  const studentQuestionsPerTopic = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const q of mySubmittedQuestions) {
      const t = q.topic.trim();
      counts[t] = (counts[t] || 0) + 1;
    }
    return counts;
  }, [mySubmittedQuestions]);

  // Öğrencinin soru gönderebileceği maksimum farklı konu adedi
  const maxTopicsLimit = session?.maxTopicsPerStudent || 0;
  const submittedTopicsList = useMemo(() => {
    return Object.keys(studentQuestionsPerTopic).filter(
      (top) => (studentQuestionsPerTopic[top] || 0) > 0
    );
  }, [studentQuestionsPerTopic]);

  const activeTopic =
    selectedTopic && session?.topics?.includes(selectedTopic)
      ? selectedTopic
      : session?.topics?.[0] || 'Genel Konu';
  const activeTopicLimit = getTopicLimit(activeTopic);
  const currentTopicQuestionsCount = studentQuestionsPerTopic[activeTopic] || 0;
  const remainingTopicQuestionsCount = Math.max(0, activeTopicLimit - currentTopicQuestionsCount);
  const isTopicLimitReached = currentTopicQuestionsCount >= activeTopicLimit;

  const isSelectedTopicAlreadyUsed = submittedTopicsList.some(
    (t) => t.toLowerCase() === activeTopic.toLowerCase()
  );
  const isTopicsLimitReached =
    maxTopicsLimit > 0 &&
    submittedTopicsList.length >= maxTopicsLimit &&
    !isSelectedTopicAlreadyUsed;

  const isFormDisabled = isQuestionLimitReached || isTopicLimitReached || isTopicsLimitReached;

  // Single question form submit handler (Konu açılır liste + Soru + 5 Seçenek tek seferde)
  const handleSingleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitSuccessMsg('');
    setSubmitErrorMsg('');

    if (isQuestionLimitReached) {
      setSubmitErrorMsg(
        `Bu oturum için belirlenen genel soru yükleme sınırına (${maxQuestionsLimit} soru) ulaştınız. Yeni soru eklenemez.`
      );
      return;
    }

    const topicToUse = selectedTopic || session?.topics[0] || 'Genel Konu';
    const isTopicAlreadyUsed = submittedTopicsList.some(
      (t) => t.toLowerCase() === topicToUse.toLowerCase()
    );
    if (maxTopicsLimit > 0 && submittedTopicsList.length >= maxTopicsLimit && !isTopicAlreadyUsed) {
      setSubmitErrorMsg(
        `Bu oturum için öğrenci başına en fazla ${maxTopicsLimit} farklı konuya soru gönderme sınırına (${submittedTopicsList.length}/${maxTopicsLimit} konu) ulaştınız. Yeni bir konuya soru ekleyemezsiniz.`
      );
      return;
    }

    const topicLimit = getTopicLimit(topicToUse);
    const topicCount = studentQuestionsPerTopic[topicToUse] || 0;
    if (topicCount >= topicLimit) {
      setSubmitErrorMsg(
        `"${topicToUse}" konusu için belirlenen soru sorma sınırına (${topicLimit} soru) ulaştınız. Lütfen başka bir konu başlığı seçiniz.`
      );
      return;
    }

    if (!formQuestion.trim()) {
      setSubmitErrorMsg('Lütfen soru metnini (soru kökü) giriniz.');
      return;
    }

    if (
      !formOptionA.trim() ||
      !formOptionB.trim() ||
      !formOptionC.trim() ||
      !formOptionD.trim() ||
      !formOptionE.trim()
    ) {
      setSubmitErrorMsg('Lütfen 5 seçeneğin (A, B, C, D, E) tümünü eksiksiz doldurunuz.');
      return;
    }

    if (!studentName.trim()) {
      setSubmitErrorMsg('Öğrenci Ad Soyad alanı zorunludur.');
      return;
    }

    if (!['A', 'B', 'C', 'D', 'E'].includes(formAnswer)) {
      setSubmitErrorMsg('Lütfen doğru cevabı (A, B, C, D veya E) seçiniz.');
      return;
    }

    setIsSubmittingQuestion(true);
    try {
      const res = await apiFetch(`/api/sessions/${sessionCode}/questions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentNo: studentNo.trim(),
          studentName: studentName.trim(),
          topic: topicToUse,
          question: formQuestion.trim(),
          optionA: formOptionA.trim(),
          optionB: formOptionB.trim(),
          optionC: formOptionC.trim(),
          optionD: formOptionD.trim(),
          optionE: formOptionE.trim(),
          answer: formAnswer,
        }),
      });

      const data = await safeJson<{ error?: string }>(res);
      if (!res.ok) {
        throw new Error(data?.error || `Soru yüklenemedi (HTTP ${res.status}).`);
      }

      const nextRemaining = Math.max(0, maxQuestionsLimit - (questionsSubmittedCount + 1));
      const nextTopicRemaining = Math.max(0, topicLimit - (topicCount + 1));
      setSubmitSuccessMsg(
        nextTopicRemaining === 0
          ? `Tebrikler! Sorunuz başarıyla kaydedildi. "${topicToUse}" konusuna ait soru kotanızı (${topicLimit}/${topicLimit}) doldurdunuz. Dilerseniz diğer konular için soru hazırlayabilirsiniz.`
          : `Tebrikler! Sorunuz başarıyla kaydedildi. Kalan genel soru hazırlama hakkınız: ${nextRemaining} adet.`
      );

      // Form alanlarını sıfırla
      setFormQuestion('');
      setFormOptionA('');
      setFormOptionB('');
      setFormOptionC('');
      setFormOptionD('');
      setFormOptionE('');
      setFormAnswer('A');

      await fetchSession();
    } catch (err: unknown) {
      setSubmitErrorMsg(err instanceof Error ? err.message : 'Soru gönderilemedi.');
    } finally {
      setIsSubmittingQuestion(false);
    }
  };

  // Student Edit Question Handlers
  const handleStartEdit = (q: AikenQuestion) => {
    setEditingQuestion(q);
    setEditTopic(q.topic);
    setEditQuestionText(q.question);
    setEditOptionA(q.optionA);
    setEditOptionB(q.optionB);
    setEditOptionC(q.optionC);
    setEditOptionD(q.optionD);
    setEditOptionE(q.optionE);
    setEditAnswer((q.answer as 'A' | 'B' | 'C' | 'D' | 'E') || 'A');
    setEditErrorMsg('');
  };

  const handleCancelEdit = () => {
    setEditingQuestion(null);
    setEditErrorMsg('');
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingQuestion) return;
    setEditErrorMsg('');

    if (!editQuestionText.trim()) {
      setEditErrorMsg('Lütfen soru metnini giriniz.');
      return;
    }

    if (
      !editOptionA.trim() ||
      !editOptionB.trim() ||
      !editOptionC.trim() ||
      !editOptionD.trim() ||
      !editOptionE.trim()
    ) {
      setEditErrorMsg('Lütfen 5 seçeneğin (A, B, C, D, E) tümünü eksiksiz doldurunuz.');
      return;
    }

    if (!['A', 'B', 'C', 'D', 'E'].includes(editAnswer)) {
      setEditErrorMsg('Lütfen doğru cevabı belirleyiniz.');
      return;
    }

    setIsSavingEdit(true);
    try {
      const res = await apiFetch(`/api/sessions/${sessionCode}/questions/${editingQuestion.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentNo: studentNo.trim(),
          topic: editTopic.trim(),
          question: editQuestionText.trim(),
          optionA: editOptionA.trim(),
          optionB: editOptionB.trim(),
          optionC: editOptionC.trim(),
          optionD: editOptionD.trim(),
          optionE: editOptionE.trim(),
          answer: editAnswer,
        }),
      });

      const data = await safeJson<{ error?: string }>(res);
      if (!res.ok) {
        throw new Error(data?.error || `Soru güncellenemedi (HTTP ${res.status}).`);
      }

      setEditingQuestion(null);
      setActionSuccessBanner('Sorunuz başarıyla güncellendi.');
      setTimeout(() => setActionSuccessBanner(''), 4000);
      await fetchSession();
    } catch (err: unknown) {
      setEditErrorMsg(err instanceof Error ? err.message : 'Güncelleme hatası.');
    } finally {
      setIsSavingEdit(false);
    }
  };

  // Student Delete Question Handler
  const handleDeleteQuestion = async (q: AikenQuestion) => {
    setIsDeletingQuestion(true);
    try {
      const res = await apiFetch(`/api/sessions/${sessionCode}/questions/${q.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentNo: studentNo.trim() }),
      });

      const data = await safeJson<{ error?: string }>(res);
      if (!res.ok) {
        throw new Error(data?.error || `Soru silinemedi (HTTP ${res.status}).`);
      }

      setDeletingQuestion(null);
      setActionSuccessBanner(`"${q.topic}" konusuna ait sorunuz başarıyla silindi. Soru hazırlama hakkınız geri yüklendi.`);
      setTimeout(() => setActionSuccessBanner(''), 4500);
      await fetchSession();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Soru silinirken hata oluştu.');
    } finally {
      setIsDeletingQuestion(false);
    }
  };

  // Filter selected questions for quiz
  const selectedQuestionsForQuiz =
    session?.questions.filter((q) => q.selectionStatus === 'Seçildi') || [];
  const activeQuizIndex = session?.quizState.activeQuestionIndex ?? 0;
  const currentQuizQuestion = selectedQuestionsForQuiz[activeQuizIndex] || null;

  // Answers submitted by this student for the current question
  const currentStudentAnswersForQ = (session && currentQuizQuestion && studentNo)
    ? session.answers.filter(
        (a) => a.questionId === currentQuizQuestion.id && a.studentNo.trim() === studentNo.trim()
      )
    : [];

  const maxAttemptsForCurrentQ = session?.maxAnswerAttemptsPerQuestion || 1;
  const attemptsUsedForCurrentQ = currentStudentAnswersForQ.length;
  const isAttemptLimitReached = attemptsUsedForCurrentQ >= maxAttemptsForCurrentQ;

  // Shuffled options for anti-cheating, seeded deterministically by (studentNo + questionId)
  const displayedShuffledOptions = useMemo(() => {
    if (!currentQuizQuestion) return [];

    const baseOptions = [
      { originalKey: 'A', text: currentQuizQuestion.optionA },
      { originalKey: 'B', text: currentQuizQuestion.optionB },
      { originalKey: 'C', text: currentQuizQuestion.optionC },
      { originalKey: 'D', text: currentQuizQuestion.optionD },
      { originalKey: 'E', text: currentQuizQuestion.optionE },
    ];

    // Seeded PRNG using studentNo + questionId
    const seed = `${studentNo.trim() || 'anon'}_${currentQuizQuestion.id}`;
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
      hash = (hash << 5) - hash + seed.charCodeAt(i);
      hash |= 0;
    }

    const random = () => {
      hash = (hash * 9301 + 49297) % 233280;
      return Math.abs(hash) / 233280;
    };

    const shuffled = [...baseOptions];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    const letters = ['A', 'B', 'C', 'D', 'E'];
    return shuffled.map((item, idx) => ({
      displayLetter: letters[idx],
      originalKey: item.originalKey,
      text: item.text,
    }));
  }, [
    currentQuizQuestion?.id,
    studentNo,
    currentQuizQuestion?.optionA,
    currentQuizQuestion?.optionB,
    currentQuizQuestion?.optionC,
    currentQuizQuestion?.optionD,
    currentQuizQuestion?.optionE,
  ]);

  // Submit Quiz Answer
  const handleSubmitQuizAnswer = async () => {
    if (!selectedOption || !session || !currentQuizQuestion) return;

    if (isAttemptLimitReached) {
      setSubmitAnswerWarning(
        `Bu soru için belirlenen cevap verme hakkınızı (${maxAttemptsForCurrentQ} hak) doldurdunuz. Yeni cevap verilemez ve Google Sheet'e kaydedilmez.`
      );
      return;
    }

    if (!studentName.trim()) {
      setSubmitAnswerWarning('Öğrenci Ad Soyad alanı zorunludur. Lütfen adınızı ve soyadınızı kontrol ediniz.');
      return;
    }

    setIsSubmittingAnswer(true);
    setSubmitAnswerWarning('');
    try {
      const res = await apiFetch(`/api/sessions/${sessionCode}/quiz/answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentNo: studentNo.trim(),
          studentName: studentName.trim(),
          answer: selectedOption,
        }),
      });

      const data = await safeJson<{ error?: string }>(res);
      if (!res.ok) {
        throw new Error(data?.error || `Cevap gönderilemedi (HTTP ${res.status}).`);
      }

      await fetchSession();
    } catch (err: unknown) {
      setSubmitAnswerWarning(err instanceof Error ? err.message : 'Cevap iletilemedi.');
    } finally {
      setIsSubmittingAnswer(false);
    }
  };

  // If not joined yet, show join card
  if (!isJoined) {
    return (
      <div className="max-w-md mx-auto p-4 sm:p-6 my-8">
        <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-xl border border-slate-100 flex flex-col gap-6">
          <div className="text-center">
            <div className="w-14 h-14 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-inner">
              <BookOpen className="w-7 h-7" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900">Öğrenci Girişi</h2>
            <p className="text-sm text-slate-500 mt-1">
              Öğretmeninizin tahtada paylaştığı 5 haneli oturum kodunu giriniz.
            </p>
          </div>

          {joinError && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{joinError}</span>
            </div>
          )}

          <form onSubmit={handleJoin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                5 Haneli Oturum Kodu (PIN)
              </label>
              <input
                type="text"
                maxLength={5}
                value={sessionCode}
                onChange={(e) => setSessionCode(e.target.value.replace(/\D/g, ''))}
                placeholder="Örn: 12345"
                className="w-full text-center text-3xl font-mono font-bold tracking-widest px-4 py-3 bg-slate-50 border-2 border-slate-200 focus:border-indigo-600 focus:bg-white rounded-2xl outline-hidden transition-all text-indigo-900"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                  Öğrenci Numarası (9 Haneli Rakam) *
                </label>
                <span
                  className={`text-[11px] font-mono font-bold ${
                    studentNo.length === 9 ? 'text-emerald-600' : 'text-slate-400'
                  }`}
                >
                  {studentNo.length}/9 Hane
                </span>
              </div>
              <input
                type="text"
                inputMode="numeric"
                required
                maxLength={9}
                value={studentNo}
                onChange={(e) => {
                  const digitsOnly = e.target.value.replace(/\D/g, '').slice(0, 9);
                  setStudentNo(digitsOnly);
                }}
                placeholder="Örn: 210101001"
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 focus:border-indigo-600 focus:bg-white rounded-xl outline-hidden text-sm font-bold font-mono tracking-wider transition-all"
              />
              {studentNo.length > 0 && studentNo.length < 9 ? (
                <p className="text-[11px] text-amber-600 font-semibold mt-1 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  Öğrenci numarası tam 9 haneli rakamlardan oluşmalıdır ({9 - studentNo.length} hane eksik).
                </p>
              ) : (
                <p className="text-[11px] text-slate-400 mt-1">
                  Yalnızca 9 haneli rakamlardan oluşan öğrenci numaranızı giriniz.
                </p>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                  Ad Soyad *
                </label>
                <span className="text-[11px] text-rose-500 font-bold">
                  Zorunlu Alan
                </span>
              </div>
              <input
                type="text"
                required
                value={studentName}
                onChange={(e) => setStudentName(e.target.value)}
                placeholder="Örn: Mehmet Yılmaz"
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 focus:border-indigo-600 focus:bg-white rounded-xl outline-hidden text-sm font-medium transition-all"
              />
              {studentName.trim().length > 0 && studentName.trim().length < 3 ? (
                <p className="text-[11px] text-amber-600 font-semibold mt-1">
                  Ad ve soyad en az 3 karakter olmalıdır.
                </p>
              ) : (
                <p className="text-[11px] text-slate-400 mt-1">
                  Quiz ve sonuç analizlerinde görünecek Ad ve Soyadınızı giriniz.
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={
                isLoadingSession ||
                studentNo.length !== 9 ||
                sessionCode.trim().length !== 5 ||
                studentName.trim().length < 3
              }
              className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-semibold rounded-2xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoadingSession ? (
                <RefreshCw className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  <span>Oturuma Katıl</span>
                  <ArrowRight className="w-5 h-5" />
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Active Session View
  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-6">
      {/* Session Top Bar */}
      <div className="bg-white rounded-2xl p-4 sm:p-5 shadow-xs border border-slate-200 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-sm">
            {session?.code}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-slate-900">{session?.courseName}</h2>
              <span className="px-2 py-0.5 bg-slate-100 text-slate-700 text-xs font-semibold rounded-full">
                Kod: {session?.code}
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Öğrenci: <strong className="text-slate-700">{studentNo}</strong>
              {studentName && ` (${studentName})`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {session?.status === 'collecting' && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full text-xs font-medium">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              Soru Kabulü Açık
            </span>
          )}
          {session?.status === 'analyzing' && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-full text-xs font-medium">
              <Sparkles className="w-3.5 h-3.5 animate-spin" />
              Gemini Analiz Ediyor...
            </span>
          )}
          {session?.status === 'selection_review' && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-full text-xs font-medium">
              <Clock className="w-3.5 h-3.5" />
              Quiz Başlangıcı Bekleniyor
            </span>
          )}
          {session?.status === 'quiz_active' && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-purple-50 text-purple-700 border border-purple-200 rounded-full text-xs font-semibold animate-pulse">
              <Trophy className="w-3.5 h-3.5" />
              Canlı Quiz Aktif!
            </span>
          )}
          {session?.status === 'finished' && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-100 text-slate-700 rounded-full text-xs font-medium">
              Quiz Tamamlandı
            </span>
          )}

          <button
            onClick={handleLeaveSession}
            className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 cursor-pointer"
            title="Oturumdan Ayrıl"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* QUIZ ACTIVE VIEW */}
      {session?.status === 'quiz_active' && currentQuizQuestion && (
        <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-xl border-2 border-indigo-100 space-y-6 animate-in fade-in duration-200">
          <div className="flex flex-wrap items-center justify-between border-b border-slate-100 pb-4 gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-3 py-1 bg-indigo-600 text-white text-xs font-bold rounded-lg shadow-xs">
                Soru {activeQuizIndex + 1} / {selectedQuestionsForQuiz.length}
              </span>
              <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2.5 py-1 rounded-md">
                Konu: {currentQuizQuestion.topic}
              </span>

              {/* Attempt Limit Badge */}
              <span
                className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-lg border ${
                  isAttemptLimitReached
                    ? 'bg-rose-50 text-rose-700 border-rose-200'
                    : 'bg-indigo-50 text-indigo-700 border-indigo-200'
                }`}
              >
                {isAttemptLimitReached ? (
                  <>
                    <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
                    <span>Cevap Hakkı Doldu ({attemptsUsedForCurrentQ}/{maxAttemptsForCurrentQ})</span>
                  </>
                ) : (
                  <span>Kalan Hak: {maxAttemptsForCurrentQ - attemptsUsedForCurrentQ} / {maxAttemptsForCurrentQ}</span>
                )}
              </span>
            </div>

            {session.quizState.isAcceptingAnswers ? (
              <span className="text-xs font-semibold text-emerald-600 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
                Cevaplama Açık
              </span>
            ) : (
              <span className="text-xs font-semibold text-rose-600 bg-rose-50 px-2.5 py-1 rounded-full">
                Süre Doldu (Kilitli)
              </span>
            )}
          </div>

          {/* Warning Banner if attempts exceeded or error */}
          {submitAnswerWarning && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-800 rounded-2xl text-xs flex items-center gap-2.5 animate-in fade-in">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span className="font-semibold">{submitAnswerWarning}</span>
            </div>
          )}

          {/* Attempt Limit Reached Info Banner */}
          {isAttemptLimitReached && (
            <div className="p-4 bg-amber-50 border-2 border-amber-300 text-amber-900 rounded-2xl text-xs flex items-start gap-3 shadow-xs animate-in fade-in">
              <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <h5 className="font-bold text-amber-950 text-sm">Cevap Verme Hakkı Sınırına Ulaşıldı</h5>
                <p className="mt-0.5 text-amber-800 leading-relaxed">
                  Bu soru için belirlenen <strong>{maxAttemptsForCurrentQ}</strong> cevap hakkınızı doldurdunuz. Ek cevap kabul edilmemekte ve Google Sheet veritabanına kaydedilmemektedir.
                </p>
              </div>
            </div>
          )}

          {/* Question Text */}
          <div className="py-2">
            <p className="text-lg sm:text-xl font-semibold text-slate-900 leading-relaxed">
              {currentQuizQuestion.question}
            </p>
          </div>

          {/* Anti-Cheating Indicator Badge */}
          <div className="flex items-center gap-2 text-xs text-indigo-900 bg-indigo-50/80 border border-indigo-200/80 px-3.5 py-2 rounded-2xl w-fit">
            <ShieldCheck className="w-4 h-4 text-indigo-600 shrink-0" />
            <span className="font-medium">
              Kopya Önleme Koruması: Seçenek sıralaması öğrenci bazında rastgele karıştırılmıştır.
            </span>
          </div>

          {/* Options A, B, C, D, E (Shuffled deterministically per student) */}
          <div className="space-y-3">
            {displayedShuffledOptions.map(({ displayLetter, originalKey, text }) => {
              const isSelected = selectedOption === originalKey;
              const isCorrectAnswer = currentQuizQuestion.answer.toUpperCase() === originalKey.toUpperCase();
              const isRevealed = session.quizState.showAnswer;

              let buttonStyle =
                'border-slate-200 hover:border-indigo-400 bg-slate-50/60 hover:bg-indigo-50/30 text-slate-800';

              if (isSelected && !isRevealed) {
                buttonStyle = 'border-indigo-600 bg-indigo-50 text-indigo-900 ring-2 ring-indigo-500/20';
              }

              if (isRevealed) {
                if (isCorrectAnswer) {
                  buttonStyle = 'border-emerald-500 bg-emerald-50 text-emerald-950 ring-2 ring-emerald-500/30 font-semibold';
                } else if (isSelected && !isCorrectAnswer) {
                  buttonStyle = 'border-rose-400 bg-rose-50 text-rose-900';
                } else {
                  buttonStyle = 'border-slate-200 opacity-60 bg-white';
                }
              }

              return (
                <button
                  key={originalKey}
                  type="button"
                  disabled={isAttemptLimitReached || !session.quizState.isAcceptingAnswers || isRevealed}
                  onClick={() => setSelectedOption(originalKey)}
                  className={`w-full text-left p-4 rounded-2xl border-2 transition-all flex items-start gap-3 cursor-pointer disabled:cursor-not-allowed ${buttonStyle}`}
                >
                  <span
                    className={`w-8 h-8 rounded-xl font-bold text-sm flex items-center justify-center shrink-0 ${
                      isSelected
                        ? 'bg-indigo-600 text-white'
                        : isRevealed && isCorrectAnswer
                        ? 'bg-emerald-600 text-white'
                        : 'bg-white border border-slate-300 text-slate-700'
                    }`}
                  >
                    {displayLetter}
                  </span>
                  <div className="flex-1 pt-0.5 leading-snug">
                    <span className="text-sm sm:text-base">{text}</span>
                    {isRevealed && isCorrectAnswer && (
                      <span className="ml-2 inline-flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-md">
                        ✓ Doğru Seçenek
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Answer Submit & Status Controls */}
          <div className="pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-4">
            {!isAttemptLimitReached ? (
              <div className="flex items-center gap-3 flex-wrap">
                <button
                  type="button"
                  onClick={handleSubmitQuizAnswer}
                  disabled={!selectedOption || !session.quizState.isAcceptingAnswers || isSubmittingAnswer || session.quizState.showAnswer}
                  className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-semibold rounded-xl shadow-md transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {isSubmittingAnswer ? (
                    <RefreshCw className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      <span>
                        {attemptsUsedForCurrentQ > 0
                          ? `Yeni Cevabımı Gönder (Kalan Hak: ${maxAttemptsForCurrentQ - attemptsUsedForCurrentQ})`
                          : 'Cevabımı Gönder'}
                      </span>
                      <Send className="w-4 h-4" />
                    </>
                  )}
                </button>

                {attemptsUsedForCurrentQ > 0 && (
                  <span className="text-xs text-slate-500 font-medium bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200">
                    Kullanılan: {attemptsUsedForCurrentQ} / {maxAttemptsForCurrentQ} hak
                    {selectedOption && ` • Seçili: ${displayedShuffledOptions.find((o) => o.originalKey === selectedOption)?.displayLetter || selectedOption}`}
                  </span>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2 text-amber-900 bg-amber-50 px-4 py-2.5 rounded-xl text-sm font-medium border border-amber-300">
                <CheckCircle2 className="w-5 h-5 text-amber-600 shrink-0" />
                <span>
                  Bu soru için belirlenen {maxAttemptsForCurrentQ} hakkınızı doldurdunuz. Kaydedilen son cevabınız:{' '}
                  <strong>
                    {displayedShuffledOptions.find((o) => o.originalKey === selectedOption)?.displayLetter || selectedOption}
                  </strong>{' '}
                  seçeneği
                </span>
              </div>
            )}

            {session.quizState.showAnswer && (
              <div className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-indigo-100 text-indigo-900">
                Doğru Cevap: <span className="text-emerald-700 font-bold">{
                  displayedShuffledOptions.find((o) => o.originalKey === currentQuizQuestion.answer)?.displayLetter || currentQuizQuestion.answer
                }</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* QUIZ FINISHED VIEW */}
      {session?.status === 'finished' && (
        <div className="bg-white rounded-3xl p-8 shadow-xl text-center space-y-4 border border-slate-100">
          <div className="w-16 h-16 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mx-auto shadow-inner">
            <Trophy className="w-8 h-8" />
          </div>
          <h3 className="text-2xl font-bold text-slate-900">Quiz Tamamlandı!</h3>
          <p className="text-slate-600 text-sm max-w-md mx-auto">
            Ders içi canlı quiz sona erdi. Katılımınız ve hazırladığınız sorular için teşekkür ederiz.
          </p>
          <div className="pt-2">
            <span className="text-xs font-medium text-slate-500">
              Cevaplarınız Google Sheet veritabanına zaman damgasıyla birlikte kaydedilmiştir.
            </span>
          </div>
        </div>
      )}

      {/* QUESTION UPLOAD PANEL (Only active in 'collecting' status) */}
      {session?.status === 'collecting' && (
        <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-xl border border-slate-100 space-y-6">
          {/* Top Panel Header */}
          <div className="border-b border-slate-100 pb-4">
            <div className="flex items-center gap-2 text-indigo-600 font-semibold text-xs tracking-wider uppercase mb-1">
              <Sparkles className="w-4 h-4" />
              Soru Hazırlama & Yükleme
            </div>
            <h3 className="text-xl font-bold text-slate-900">
              Günün Konularından 5 Seçenekli Soru Girişi
            </h3>
            <p className="text-sm text-slate-500 mt-1">
              Konuyu açılır listeden seçip, soru metni ve 5 seçeneği tek seferde girerek sorunuzu kaydedebilirsiniz.
            </p>
          </div>

          {/* QUESTION LIMIT & QUOTA TRACKER CARD */}
          <div className="p-4 bg-linear-to-r from-slate-50 to-indigo-50/50 rounded-2xl border border-slate-200/90 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-slate-800 uppercase tracking-wider">
                  Soru Yükleme Sınırı:
                </span>
                <span className="font-mono font-bold px-2.5 py-0.5 bg-white border border-slate-200 rounded-lg text-slate-800">
                  {questionsSubmittedCount} / {maxQuestionsLimit} Soru Yüklendi
                </span>

                {maxTopicsLimit > 0 && (
                  <span className="font-mono font-bold px-2.5 py-0.5 bg-purple-50 border border-purple-200 rounded-lg text-purple-800">
                    Konu Kotası: {submittedTopicsList.length} / {maxTopicsLimit} Konu
                  </span>
                )}
              </div>

              {isQuestionLimitReached ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-rose-100 text-rose-800 border border-rose-200 rounded-full font-bold">
                  <Lock className="w-3.5 h-3.5 text-rose-600" />
                  Soru Sınırı Doldu ({maxQuestionsLimit}/{maxQuestionsLimit})
                </span>
              ) : isTopicsLimitReached ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-purple-100 text-purple-800 border border-purple-200 rounded-full font-bold">
                  <Lock className="w-3.5 h-3.5 text-purple-600" />
                  Konu Kotası Doldu ({submittedTopicsList.length}/{maxTopicsLimit})
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-full font-bold">
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  Kalan Soru Hakkınız: {remainingQuestionsCount} adet
                </span>
              )}
            </div>

            {/* Quota Progress Bar */}
            <div className="w-full bg-slate-200 h-2.5 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-500 ${
                  isQuestionLimitReached ? 'bg-rose-500' : 'bg-indigo-600'
                }`}
                style={{
                  width: `${Math.min(100, Math.round((questionsSubmittedCount / maxQuestionsLimit) * 100))}%`,
                }}
              />
            </div>

            {isQuestionLimitReached && (
              <div className="pt-1 text-xs text-rose-700 flex items-start gap-2 bg-rose-50/80 p-3 rounded-xl border border-rose-200">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <div>
                  <strong>Soru Hazırlama Sınırına Ulaşıldı:</strong> Bu oturum için belirlenen{' '}
                  <strong>{maxQuestionsLimit}</strong> soru kotanızı tamamladınız. Sorularınız sisteme
                  kaydedildi. Öğretmeninizin değerlendirmeyi tamamlamasını bekleyebilirsiniz.
                </div>
              </div>
            )}
          </div>

          {submitSuccessMsg && (
            <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl text-sm flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">{submitSuccessMsg}</p>
                <p className="text-xs text-emerald-700 mt-0.5">
                  Dilerseniz diğer konu başlıkları için de yeni sorular hazırlayıp yükleyebilirsiniz.
                </p>
              </div>
            </div>
          )}

          {submitErrorMsg && (
            <div className="p-4 bg-rose-50 border border-rose-200 text-rose-700 rounded-2xl text-sm flex items-center gap-3">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <span>{submitErrorMsg}</span>
            </div>
          )}

          {/* Konu Açılır Liste + Soru Metni + 5 Seçenek Tek Seferde Form Arayüzü */}
          <form onSubmit={handleSingleFormSubmit} className="space-y-6">
              {/* Form Üst Bilgi */}
              <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-indigo-50/60 rounded-xl border border-indigo-100 text-xs">
                <span className="text-indigo-900 font-medium flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                  Konuyu açılır listeden seçin, soru metni ve 5 seçeneği girip doğru cevabı belirleyin.
                </span>
              </div>

              {/* 1. Konu Başlığı Seçimi (Açılır Liste / Dropdown) */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider">
                    1. Konu Başlığı (Açılır Listeden Seçiniz) *
                  </label>
                  <span
                    className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full ${
                      isTopicLimitReached
                        ? 'bg-rose-100 text-rose-700 border border-rose-200'
                        : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                    }`}
                  >
                    Bu Konu: {currentTopicQuestionsCount}/{activeTopicLimit} Soru {isTopicLimitReached ? '(Doldu)' : ''}
                  </span>
                </div>
                <select
                  value={selectedTopic}
                  onChange={(e) => setSelectedTopic(e.target.value)}
                  disabled={isQuestionLimitReached}
                  className={`w-full px-4 py-3 bg-slate-50 border rounded-xl text-sm font-semibold text-slate-800 focus:bg-white focus:ring-2 outline-hidden transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                    isTopicsLimitReached || isTopicLimitReached
                      ? 'border-rose-300 focus:border-rose-500 focus:ring-rose-500/20'
                      : 'border-slate-300 focus:border-indigo-600 focus:ring-indigo-500/20'
                  }`}
                >
                  {session.topics.map((t, idx) => {
                    const count = studentQuestionsPerTopic[t] || 0;
                    const topicLim = getTopicLimit(t);
                    const isFull = count >= topicLim;
                    const isUsed = count > 0;
                    const isBlockedByTopicLimit =
                      maxTopicsLimit > 0 && submittedTopicsList.length >= maxTopicsLimit && !isUsed;
                    return (
                      <option key={idx} value={t} disabled={isBlockedByTopicLimit}>
                        {t}{' '}
                        {isBlockedByTopicLimit
                          ? '(Konu Kotası Doldu)'
                          : isFull
                          ? `(Soru Hakkı Doldu: ${count}/${topicLim})`
                          : `(${count}/${topicLim} soru)`}
                      </option>
                    );
                  })}
                </select>
                {isTopicsLimitReached ? (
                  <div className="mt-2 p-2.5 bg-purple-50 border border-purple-200 rounded-xl text-xs text-purple-800 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-purple-600 shrink-0" />
                    <span>
                      En fazla <strong>{maxTopicsLimit}</strong> farklı konuya soru sorma sınırına ulaştınız ({submittedTopicsList.length}/{maxTopicsLimit} konu). Lütfen listeden daha önce soru hazırladığınız bir konuyu seçiniz.
                    </span>
                  </div>
                ) : isTopicLimitReached ? (
                  <div className="mt-2 p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                    <span>
                      <strong>"{activeTopic}"</strong> konusu için soru sorma hakkınız dolmuştur (Sınır: {activeTopicLimit} soru). Lütfen listeden başka bir konu başlığı seçiniz.
                    </span>
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-400 mt-1">
                    Sorunuzun ait olduğu ders konusunu belirleyiniz (Bu konudaki kalan hakkınız: {remainingTopicQuestionsCount} soru).
                  </p>
                )}
              </div>

              {/* 2. Soru Metni (Soru Kökü) */}
              <div>
                <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider mb-1.5">
                  2. Soru Metni (Soru Kökü) *
                </label>
                <textarea
                  rows={3}
                  value={formQuestion}
                  onChange={(e) => setFormQuestion(e.target.value)}
                  disabled={isQuestionLimitReached}
                  placeholder="Sorunuzun açık ve net metnini buraya yazınız (Örn: Aşağıdakilerden hangisi...)"
                  className="w-full p-4 bg-slate-50 border border-slate-300 rounded-2xl text-sm font-medium text-slate-900 focus:border-indigo-600 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 outline-hidden transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                />
              </div>

              {/* 3. 5 Seçenek (A, B, C, D, E) ve Doğru Cevap Belirleme */}
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider">
                    3. Soru Seçenekleri (A, B, C, D, E) & Doğru Cevap *
                  </label>
                  <span className="text-[11px] text-slate-500 font-medium">
                    Doğru seçeneği belirlemek için seçeneğin yanındaki düğmeye tıklayınız.
                  </span>
                </div>

                {/* Option Rows */}
                {(
                  [
                    { key: 'A' as const, val: formOptionA, setVal: setFormOptionA, placeholder: 'A seçeneği metnini giriniz...' },
                    { key: 'B' as const, val: formOptionB, setVal: setFormOptionB, placeholder: 'B seçeneği metnini giriniz...' },
                    { key: 'C' as const, val: formOptionC, setVal: setFormOptionC, placeholder: 'C seçeneği metnini giriniz...' },
                    { key: 'D' as const, val: formOptionD, setVal: setFormOptionD, placeholder: 'D seçeneği metnini giriniz...' },
                    { key: 'E' as const, val: formOptionE, setVal: setFormOptionE, placeholder: 'E seçeneği metnini giriniz...' },
                  ] as const
                ).map(({ key, val, setVal, placeholder }) => {
                  const isCorrect = formAnswer === key;
                  return (
                    <div
                      key={key}
                      className={`flex flex-col sm:flex-row items-stretch sm:items-center gap-2 p-2.5 rounded-2xl border transition-all ${
                        isCorrect
                          ? 'bg-emerald-50/70 border-emerald-400 ring-2 ring-emerald-500/20 shadow-2xs'
                          : 'bg-slate-50/70 border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 flex-1">
                        {/* Option Letter Badge */}
                        <span
                          className={`w-9 h-9 rounded-xl font-black text-sm flex items-center justify-center shrink-0 transition-colors ${
                            isCorrect
                              ? 'bg-emerald-600 text-white shadow-xs'
                              : 'bg-white border border-slate-300 text-slate-700 font-mono'
                          }`}
                        >
                          {key}
                        </span>

                        {/* Input Field */}
                        <input
                          type="text"
                          value={val}
                          onChange={(e) => setVal(e.target.value)}
                          disabled={isQuestionLimitReached}
                          placeholder={placeholder}
                          className="flex-1 px-3.5 py-2.5 bg-white border border-slate-200 focus:border-indigo-600 rounded-xl text-sm text-slate-900 outline-hidden transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        />
                      </div>

                      {/* Correct Answer Toggle Button */}
                      <button
                        type="button"
                        onClick={() => setFormAnswer(key)}
                        disabled={isQuestionLimitReached}
                        className={`px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 shrink-0 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                          isCorrect
                            ? 'bg-emerald-600 text-white shadow-xs'
                            : 'bg-white hover:bg-slate-100 border border-slate-200 text-slate-600 hover:text-emerald-700'
                        }`}
                      >
                        {isCorrect ? (
                          <>
                            <CheckCircle2 className="w-4 h-4" />
                            <span>Doğru Cevap ✓</span>
                          </>
                        ) : (
                          <span>Doğru Yap</span>
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>

              {/* Hızlı Doğru Cevap Seçici Butonları */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex flex-wrap items-center justify-between gap-3">
                <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Belirlenen Doğru Cevap:
                </span>
                <div className="flex items-center gap-2">
                  {(['A', 'B', 'C', 'D', 'E'] as const).map((letter) => (
                    <button
                      key={letter}
                      type="button"
                      onClick={() => setFormAnswer(letter)}
                      disabled={isQuestionLimitReached}
                      className={`w-9 h-9 rounded-xl font-black text-xs font-mono transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                        formAnswer === letter
                          ? 'bg-emerald-600 text-white ring-2 ring-emerald-500/30 shadow-xs'
                          : 'bg-white hover:bg-slate-100 border border-slate-300 text-slate-700'
                      }`}
                    >
                      {letter}
                    </button>
                  ))}
                  <span className="text-xs font-bold text-emerald-700 ml-1">
                    ({formAnswer} Seçeneği)
                  </span>
                </div>
              </div>

              {/* Form Alt Butonları */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setFormQuestion('');
                    setFormOptionA('');
                    setFormOptionB('');
                    setFormOptionC('');
                    setFormOptionD('');
                    setFormOptionE('');
                    setFormAnswer('A');
                  }}
                  disabled={isSubmittingQuestion}
                  className="px-4 py-3.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-2xl text-xs transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>Formu Temizle</span>
                </button>

                <button
                  type="submit"
                  disabled={isSubmittingQuestion || isQuestionLimitReached || isTopicLimitReached || isTopicsLimitReached}
                  className={`flex-1 py-4 text-white font-bold rounded-2xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                    isQuestionLimitReached || isTopicLimitReached || isTopicsLimitReached
                      ? 'bg-slate-500'
                      : 'bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800'
                  }`}
                >
                  {isSubmittingQuestion ? (
                    <RefreshCw className="w-5 h-5 animate-spin" />
                  ) : isQuestionLimitReached ? (
                    <>
                      <Lock className="w-5 h-5" />
                      <span>Genel Soru Giriş Sınırı Doldu ({maxQuestionsLimit}/{maxQuestionsLimit})</span>
                    </>
                  ) : isTopicsLimitReached ? (
                    <>
                      <Lock className="w-5 h-5" />
                      <span>Farklı Konu Kotası Doldu ({submittedTopicsList.length}/{maxTopicsLimit} Konu)</span>
                    </>
                  ) : isTopicLimitReached ? (
                    <>
                      <Lock className="w-5 h-5" />
                      <span>"{activeTopic}" Konusu İçin Soru Hakkı Doldu ({activeTopicLimit}/{activeTopicLimit})</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-5 h-5" />
                      <span>
                        Soruyu Sisteme Kaydet (Bu Konuda Kalan: {remainingTopicQuestionsCount}, Genel Kalan: {remainingQuestionsCount})
                      </span>
                    </>
                  )}
                </button>
              </div>
            </form>
        </div>
      )}

      {/* ACTION SUCCESS BANNER (Question Edit / Delete) */}
      {actionSuccessBanner && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl text-sm flex items-center justify-between gap-3 shadow-xs animate-in fade-in">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <span className="font-semibold">{actionSuccessBanner}</span>
          </div>
          <button
            type="button"
            onClick={() => setActionSuccessBanner('')}
            className="text-emerald-700 hover:text-emerald-900 text-xs font-bold p-1 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* MY SUBMITTED QUESTIONS LIST */}
      <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-indigo-600" />
            <h4 className="text-sm font-bold text-slate-800">
              Bu Oturumda Yüklediğiniz Sorular ({mySubmittedQuestions.length})
            </h4>
          </div>
          <div className="flex items-center gap-3 text-xs text-slate-500">
            <span>
              Öğrenci No: <strong className="font-mono text-slate-800">{studentNo}</strong>
            </span>
            {session?.status === 'collecting' && (
              <span className="inline-flex items-center gap-1 text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md font-semibold text-[11px]">
                <Pencil className="w-3 h-3" />
                Düzenlenebilir & Silinebilir
              </span>
            )}
          </div>
        </div>

        {mySubmittedQuestions.length === 0 ? (
          <p className="text-xs text-slate-500 py-3 text-center">
            Henüz soru yüklemediniz. Yukarıdaki formdan ders konularına ait 5 seçenekli sorunuzu ekleyebilirsiniz.
          </p>
        ) : (
          <div className="space-y-3">
            {mySubmittedQuestions.map((q, idx) => {
              const canModify = session?.status !== 'quiz_active' && session?.status !== 'finished';
              return (
                <div
                  key={q.id || idx}
                  className="p-4 rounded-2xl border border-slate-200 bg-slate-50/50 hover:bg-slate-50/80 transition-all space-y-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="font-semibold text-indigo-700 bg-indigo-50 border border-indigo-100 px-2.5 py-1 rounded-lg">
                      Konu: {q.topic}
                    </span>
                    <div className="flex items-center gap-2">
                      {q.selectionStatus === 'Seçildi' && (
                        <span className="px-2.5 py-1 bg-emerald-100 text-emerald-800 font-bold rounded-lg flex items-center gap-1">
                          <Check className="w-3 h-3" />
                          Quiz İçin Seçildi ({q.analysisScore} Puan)
                        </span>
                      )}
                      {q.selectionStatus === 'Seçilmedi' && (
                        <span className="px-2.5 py-1 bg-slate-200 text-slate-700 font-medium rounded-lg">
                          Seçilmedi ({q.analysisScore} Puan)
                        </span>
                      )}
                      {q.selectionStatus === 'Beklemede' && (
                        <span className="px-2.5 py-1 bg-amber-100 text-amber-800 font-semibold rounded-lg flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          Değerlendirme Bekleniyor
                        </span>
                      )}
                    </div>
                  </div>

                  <p className="text-sm font-semibold text-slate-900 leading-relaxed">{q.question}</p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-xs text-slate-700 pt-1">
                    <div className={`p-1.5 rounded-lg border ${q.answer === 'A' ? 'bg-emerald-50 border-emerald-300 font-bold text-emerald-900' : 'bg-white border-slate-200'}`}>
                      A) {q.optionA} {q.answer === 'A' && '✓'}
                    </div>
                    <div className={`p-1.5 rounded-lg border ${q.answer === 'B' ? 'bg-emerald-50 border-emerald-300 font-bold text-emerald-900' : 'bg-white border-slate-200'}`}>
                      B) {q.optionB} {q.answer === 'B' && '✓'}
                    </div>
                    <div className={`p-1.5 rounded-lg border ${q.answer === 'C' ? 'bg-emerald-50 border-emerald-300 font-bold text-emerald-900' : 'bg-white border-slate-200'}`}>
                      C) {q.optionC} {q.answer === 'C' && '✓'}
                    </div>
                    <div className={`p-1.5 rounded-lg border ${q.answer === 'D' ? 'bg-emerald-50 border-emerald-300 font-bold text-emerald-900' : 'bg-white border-slate-200'}`}>
                      D) {q.optionD} {q.answer === 'D' && '✓'}
                    </div>
                    <div className={`sm:col-span-2 p-1.5 rounded-lg border ${q.answer === 'E' ? 'bg-emerald-50 border-emerald-300 font-bold text-emerald-900' : 'bg-white border-slate-200'}`}>
                      E) {q.optionE} {q.answer === 'E' && '✓'}
                    </div>
                  </div>

                  {/* Question Actions (Edit & Delete) */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200/80">
                    <div className="text-xs font-bold text-emerald-800 flex items-center gap-1.5">
                      <span className="w-5 h-5 rounded-md bg-emerald-600 text-white flex items-center justify-center font-mono text-[11px]">
                        {q.answer}
                      </span>
                      <span>Belirlenen Doğru Cevap: Seçenek {q.answer}</span>
                    </div>

                    {canModify ? (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleStartEdit(q)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-indigo-50 text-indigo-700 hover:text-indigo-900 border border-slate-200 hover:border-indigo-300 rounded-xl text-xs font-bold transition-all shadow-2xs cursor-pointer"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                          <span>Düzenle</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setDeletingQuestion(q)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-rose-50 text-rose-600 hover:text-rose-800 border border-slate-200 hover:border-rose-300 rounded-xl text-xs font-bold transition-all shadow-2xs cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Sil</span>
                        </button>
                      </div>
                    ) : (
                      <span className="text-[11px] text-slate-400 italic">
                        Canlı quiz aşamasında düzenleme kilitlidir.
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* STUDENT EDIT QUESTION MODAL */}
      {editingQuestion && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-xl w-full p-6 sm:p-7 shadow-2xl border border-slate-100 space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="border-b border-slate-100 pb-3 flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center">
                    <Pencil className="w-4 h-4" />
                  </div>
                  <h3 className="text-xl font-bold text-slate-900">Soruyu Düzenle</h3>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Soru metnini, seçenekleri veya doğru cevabı güncelleyebilirsiniz.
                </p>
              </div>
              <button
                type="button"
                onClick={handleCancelEdit}
                className="text-slate-400 hover:text-slate-600 rounded-lg p-1.5 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {editErrorMsg && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{editErrorMsg}</span>
              </div>
            )}

            <form onSubmit={handleSaveEdit} className="space-y-4">
              {/* Konu Seçimi */}
              <div>
                <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider mb-1.5">
                  Konu Başlığı *
                </label>
                <select
                  value={editTopic}
                  onChange={(e) => setEditTopic(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-semibold text-slate-800 focus:bg-white focus:border-indigo-600 outline-hidden"
                >
                  {session?.topics?.map((t, idx) => {
                    const isCurrentTopic = t.toLowerCase() === (editingQuestion?.topic || '').toLowerCase();
                    const hasOtherQuestionsInTopic = mySubmittedQuestions.some(
                      (q) => q.id !== editingQuestion?.id && q.topic.toLowerCase() === t.toLowerCase()
                    );
                    const otherUniqueTopics = new Set(
                      mySubmittedQuestions
                        .filter((q) => q.id !== editingQuestion?.id)
                        .map((q) => q.topic.toLowerCase())
                    );
                    const isBlocked =
                      maxTopicsLimit > 0 &&
                      !isCurrentTopic &&
                      !hasOtherQuestionsInTopic &&
                      otherUniqueTopics.size >= maxTopicsLimit;
                    return (
                      <option key={idx} value={t} disabled={isBlocked}>
                        {t} {isBlocked ? '(Maksimum Konu Sınırı Doldu)' : ''}
                      </option>
                    );
                  })}
                </select>
              </div>

              {/* Soru Kökü */}
              <div>
                <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider mb-1.5">
                  Soru Metni (Soru Kökü) *
                </label>
                <textarea
                  rows={3}
                  required
                  value={editQuestionText}
                  onChange={(e) => setEditQuestionText(e.target.value)}
                  placeholder="Soru metnini giriniz..."
                  className="w-full p-3 bg-slate-50 border border-slate-300 rounded-xl text-sm text-slate-900 focus:bg-white focus:border-indigo-600 outline-hidden"
                />
              </div>

              {/* 5 Seçenek */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider">
                  5 Seçenek (A, B, C, D, E) & Doğru Cevap *
                </label>
                {(
                  [
                    { key: 'A' as const, val: editOptionA, setVal: setEditOptionA },
                    { key: 'B' as const, val: editOptionB, setVal: setEditOptionB },
                    { key: 'C' as const, val: editOptionC, setVal: setEditOptionC },
                    { key: 'D' as const, val: editOptionD, setVal: setEditOptionD },
                    { key: 'E' as const, val: editOptionE, setVal: setEditOptionE },
                  ] as const
                ).map(({ key, val, setVal }) => {
                  const isCorrect = editAnswer === key;
                  return (
                    <div
                      key={key}
                      className={`flex items-center gap-2 p-2 rounded-xl border transition-all ${
                        isCorrect
                          ? 'bg-emerald-50 border-emerald-400 ring-1 ring-emerald-500/20'
                          : 'bg-slate-50 border-slate-200'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => setEditAnswer(key)}
                        className={`w-7 h-7 rounded-lg font-bold text-xs flex items-center justify-center cursor-pointer shrink-0 ${
                          isCorrect
                            ? 'bg-emerald-600 text-white shadow-xs'
                            : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        {key}
                      </button>
                      <input
                        type="text"
                        required
                        value={val}
                        onChange={(e) => setVal(e.target.value)}
                        placeholder={`${key} seçeneği...`}
                        className="flex-1 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-900 outline-hidden focus:border-indigo-600"
                      />
                      <button
                        type="button"
                        onClick={() => setEditAnswer(key)}
                        className={`px-2.5 py-1 text-[11px] font-bold rounded-lg cursor-pointer ${
                          isCorrect
                            ? 'bg-emerald-600 text-white'
                            : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {isCorrect ? 'Doğru ✓' : 'Seç'}
                      </button>
                    </div>
                  );
                })}
              </div>

              {/* Alt Butonlar */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  disabled={isSavingEdit}
                  className="px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  Vazgeç
                </button>
                <button
                  type="submit"
                  disabled={isSavingEdit}
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                >
                  {isSavingEdit ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Kaydediliyor...</span>
                    </>
                  ) : (
                    <span>Değişiklikleri Kaydet</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* STUDENT DELETE QUESTION CONFIRMATION MODAL */}
      {deletingQuestion && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-bold text-slate-900">Soruyu Silmek İstiyor Musunuz?</h3>
                <p className="text-xs text-slate-500">
                  Bu işlem soruyu kalıcı olarak kaldıracaktır.
                </p>
              </div>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-1">
              <div className="font-semibold text-indigo-700">Konu: {deletingQuestion.topic}</div>
              <p className="text-slate-800 font-medium line-clamp-2">"{deletingQuestion.question}"</p>
            </div>

            <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-emerald-800 text-xs">
              <strong>Faydalı Bilgi:</strong> Soruyu sildiğinizde <strong>"{deletingQuestion.topic}"</strong> konusuna ait ve oturumdaki genel soru kotanızdan 1 hak hemen geri açılacaktır. Böylece yeni bir soru hazırlayabilirsiniz.
            </div>

            <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setDeletingQuestion(null)}
                disabled={isDeletingQuestion}
                className="px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 rounded-xl cursor-pointer"
              >
                Vazgeç
              </button>
              <button
                type="button"
                onClick={() => handleDeleteQuestion(deletingQuestion)}
                disabled={isDeletingQuestion}
                className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
              >
                {isDeletingQuestion ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Siliniyor...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Evet, Soruyu Sil</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
