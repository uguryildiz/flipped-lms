import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Sparkles,
  Users,
  FileSpreadsheet,
  Play,
  CheckCircle2,
  XCircle,
  Copy,
  ExternalLink,
  RefreshCw,
  Plus,
  Sliders,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  Trophy,
  BarChart3,
  Filter,
  Check,
  AlertTriangle,
  AlertCircle,
  FolderSync,
  Download,
  UserCheck,
  LogOut,
  Link2,
  Layers,
  BookOpen,
  ListFilter,
  GraduationCap,
} from 'lucide-react';
import { AikenQuestion, QuizAnswer, SessionInfo, TopicConfig } from '../types';
import { GoogleSignInButton } from './GoogleSignInButton';
import { ConfirmationModal } from './ConfirmationModal';
import { TeacherLogin } from './TeacherLogin';
import { QuizReportView } from './QuizReportView';
import {
  googleSignIn,
  getCurrentUser,
  logout,
  initAuth,
  onTokenChange,
  hasGoogleToken,
  getAccessToken,
} from '../services/auth';
import {
  createQuizSpreadsheet,
  connectExistingSpreadsheet,
  listUserSpreadsheets,
  syncAllQuestionsWithUpdate,
  syncAnswersBatchToSheet,
  syncAnswerToSheet,
} from '../services/sheets';
import { apiFetch, safeJson } from '../utils/api';

interface TeacherDashboardProps {
  activeSessionCode: string;
  onSessionCodeChange: (code: string) => void;
  onSwitchToStudentView?: (code: string) => void;
}

export const TeacherDashboard: React.FC<TeacherDashboardProps> = ({
  activeSessionCode,
  onSessionCodeChange,
  onSwitchToStudentView,
}) => {
  // Teacher Authentication State (Stored in localStorage for persistent login)
  const [teacherAuth, setTeacherAuth] = useState<{ registrationNo: string; title: string } | null>(() => {
    try {
      const stored = localStorage.getItem('edu_teacher_auth');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  // Session State (with resilient localStorage persistence)
  const [session, setSessionState] = useState<SessionInfo | null>(() => {
    try {
      const stored = localStorage.getItem('edu_last_session');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  const setSession = (
    val: SessionInfo | null | ((prev: SessionInfo | null) => SessionInfo | null)
  ) => {
    setSessionState((prev) => {
      const next = typeof val === 'function' ? val(prev) : val;
      try {
        if (next) {
          localStorage.setItem('edu_last_session', JSON.stringify(next));
        }
      } catch {}
      return next;
    });
  };

  const [isLoadingSession, setIsLoadingSession] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Course Name & Topics direct form fields state
  const [editableCourseName, setEditableCourseName] = useState('');
  const [editableTopics, setEditableTopics] = useState<string[]>([]);
  const [newTopicInput, setNewTopicInput] = useState('');
  const [editableAttemptsLimit, setEditableAttemptsLimit] = useState<number>(1);
  const [editableQuestionsLimit, setEditableQuestionsLimit] = useState<number>(1);
  const [editableTopicQuestionsLimit, setEditableTopicQuestionsLimit] = useState<number>(1);
  const [editableMaxTopicsLimit, setEditableMaxTopicsLimit] = useState<number>(0);
  const [editableThreshold, setEditableThreshold] = useState<number>(75);
  const [editableTopCount, setEditableTopCount] = useState<number>(2);
  const [editableSelectionMode, setEditableSelectionMode] = useState<
    'threshold' | 'top_count' | 'threshold_and_top_count'
  >('threshold_and_top_count');
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [settingsSuccessMsg, setSettingsSuccessMsg] = useState('');

  // Additional evaluation criteria / prompt state for Gemini
  const [additionalPromptInput, setAdditionalPromptInput] = useState('');
  const [isFinalizingEvaluation, setIsFinalizingEvaluation] = useState(false);

  // Selection mode: 'threshold' or 'top_count'
  const [selectionMode, setSelectionMode] = useState<'threshold' | 'top_count'>('threshold');
  const [topCountInput, setTopCountInput] = useState<number>(3);
  const [questionsViewMode, setQuestionsViewMode] = useState<'grouped' | 'list'>('grouped');
  const [collapsedTopics, setCollapsedTopics] = useState<Record<string, boolean>>({});
  const [updatingTopic, setUpdatingTopic] = useState<string | null>(null);
  const [bulkMode, setBulkMode] = useState<'threshold_and_top_count' | 'threshold' | 'top_count'>(
    'threshold_and_top_count'
  );
  const [bulkThreshold, setBulkThreshold] = useState<number>(75);
  const [bulkTopCount, setBulkTopCount] = useState<number>(2);

  // New Session Modal
  const [isNewSessionModalOpen, setIsNewSessionModalOpen] = useState(false);
  const [newCourseName, setNewCourseName] = useState('');
  const [newTopicsInput, setNewTopicsInput] = useState('');
  const [newThreshold, setNewThreshold] = useState(75);
  const [newTopCount, setNewTopCount] = useState<number>(2);
  const [newSelectionMode, setNewSelectionMode] = useState<
    'threshold' | 'top_count' | 'threshold_and_top_count'
  >('threshold_and_top_count');
  const [newAttemptsLimit, setNewAttemptsLimit] = useState<number>(1);
  const [newQuestionsLimit, setNewQuestionsLimit] = useState<number>(1);
  const [newTopicQuestionsLimit, setNewTopicQuestionsLimit] = useState<number>(1);
  const [newMaxTopicsLimit, setNewMaxTopicsLimit] = useState<number>(0);
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const [isSyncingAnswers, setIsSyncingAnswers] = useState(false);
  const [answersSyncSuccessMsg, setAnswersSyncSuccessMsg] = useState('');
  const [isGeneratingQuizReport, setIsGeneratingQuizReport] = useState(false);
  const [showLiveReportModal, setShowLiveReportModal] = useState(false);

  // Google OAuth & Sheets State
  const [googleUser, setGoogleUser] = useState(getCurrentUser());
  const [hasGoogleAuthToken, setHasGoogleAuthToken] = useState(hasGoogleToken());
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isCreatingSheet, setIsCreatingSheet] = useState(false);
  const [isSyncingSheets, setIsSyncingSheets] = useState(false);
  const [autoSyncAnswers, setAutoSyncAnswers] = useState(true);
  const [sheetSyncSuccess, setSheetSyncSuccess] = useState('');
  const [sheetCardError, setSheetCardError] = useState('');
  const [existingSheetModalError, setExistingSheetModalError] = useState('');

  // Subscribe to auth state & token changes
  useEffect(() => {
    const unsubAuth = initAuth(
      (user, token) => {
        setGoogleUser(user);
        setHasGoogleAuthToken(!!token);
      },
      () => {
        setHasGoogleAuthToken(false);
      }
    );
    const unsubToken = onTokenChange((token) => {
      setHasGoogleAuthToken(!!token);
    });
    return () => {
      unsubAuth();
      unsubToken();
    };
  }, []);

  // Existing Sheet Connection Modal State
  const [isExistingSheetModalOpen, setIsExistingSheetModalOpen] = useState(false);
  const [existingSheetInput, setExistingSheetInput] = useState('');
  const [isConnectingExistingSheet, setIsConnectingExistingSheet] = useState(false);
  const [recentDriveSheets, setRecentDriveSheets] = useState<Array<{ id: string; name: string; modifiedTime: string }>>([]);
  const [isLoadingDriveSheets, setIsLoadingDriveSheets] = useState(false);

  // Confirmation Modal State (MANDATORY for Workspace destructive/overwrite operations)
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    detail?: string;
    confirmLabel?: string;
    isDangerous?: boolean;
    action?: () => Promise<void>;
  }>({
    isOpen: false,
    title: '',
    message: '',
  });

  // Gemini Analysis State
  const [isAnalyzingWithGemini, setIsAnalyzingWithGemini] = useState(false);
  const [analysisStatusText, setAnalysisStatusText] = useState('');
  const [selectedTopicFilter, setSelectedTopicFilter] = useState('all');

  // Copy Feedback
  const [copiedCode, setCopiedCode] = useState(false);

  // Live Quiz Stats Polling
  const [liveQuizStats, setLiveQuizStats] = useState<{
    total: number;
    A: number;
    B: number;
    C: number;
    D: number;
    E: number;
  }>({ total: 0, A: 0, B: 0, C: 0, E: 0, D: 0 });

  // Synced answers tracking to prevent duplicate sheet rows
  const [syncedAnswerIds, setSyncedAnswerIds] = useState<Set<string>>(new Set());
  const syncedAnswerIdsRef = useRef<Set<string>>(new Set());
  const isSyncingAnswersRef = useRef(false);
  const lastSyncErrorTimeRef = useRef(0);

  // Load session from server
  const loadSession = async (code = activeSessionCode) => {
    setIsLoadingSession(true);
    try {
      let codeToUse = code;
      if (!codeToUse) {
        // Check if there is an active session on server
        try {
          const latestRes = await apiFetch('/api/sessions/latest');
          if (latestRes.ok) {
            const latestData = await safeJson<SessionInfo>(latestRes);
            if (latestData?.code) {
              codeToUse = latestData.code;
              onSessionCodeChange(latestData.code);
            }
          }
        } catch {}
      }

      // If still no session exists on server at all, automatically create an active session
      if (!codeToUse) {
        try {
          const autoRes = await apiFetch('/api/sessions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              courseName: 'Ders İçi Soru & Canlı Quiz',
              topics: ['Genel Konu', 'Temel Kavramlar', 'Uygulamalar'],
              scoreThreshold: 75,
              topCount: 2,
              selectionMode: 'threshold_and_top_count',
            }),
          });
          if (autoRes.ok) {
            const autoData = await safeJson<SessionInfo>(autoRes);
            if (autoData) {
              codeToUse = autoData.code;
              onSessionCodeChange(autoData.code);
              setSession(autoData);
              setEditableCourseName(autoData.courseName);
              setEditableTopics(autoData.topics || []);
              setEditableAttemptsLimit(autoData.maxAnswerAttemptsPerQuestion || 1);
              setEditableQuestionsLimit(autoData.maxQuestionsPerStudent || 1);
              setEditableTopicQuestionsLimit(autoData.maxQuestionsPerTopicPerStudent || 1);
              setEditableMaxTopicsLimit(autoData.maxTopicsPerStudent || 0);
              setEditableThreshold(autoData.scoreThreshold || 75);
              setEditableTopCount(autoData.topCount || 2);
              setEditableSelectionMode(autoData.selectionMode || 'threshold_and_top_count');
              return;
            }
          }
        } catch (e) {
          console.warn('Could not auto-create session:', e);
        }
      }

      if (!codeToUse) {
        // Fallback: check localStorage for saved session
        try {
          const stored = localStorage.getItem('edu_last_session');
          if (stored) {
            const localData: SessionInfo = JSON.parse(stored);
            if (localData && localData.code) {
              codeToUse = localData.code;
              onSessionCodeChange(localData.code);
              setSession(localData);
              setEditableCourseName(localData.courseName);
              setEditableTopics(localData.topics || []);
              setEditableAttemptsLimit(localData.maxAnswerAttemptsPerQuestion || 1);
              setEditableQuestionsLimit(localData.maxQuestionsPerStudent || 1);
              setEditableTopicQuestionsLimit(localData.maxQuestionsPerTopicPerStudent || 1);
              setEditableMaxTopicsLimit(localData.maxTopicsPerStudent || 0);
              setEditableThreshold(localData.scoreThreshold || 75);
              setEditableTopCount(localData.topCount || 2);
              setEditableSelectionMode(localData.selectionMode || 'threshold_and_top_count');
              return;
            }
          }
        } catch {}
        setSession(null);
        return;
      }

      const res = await apiFetch(`/api/sessions/${codeToUse}`);
      if (res.ok) {
        const data = await safeJson<SessionInfo>(res);
        if (data) {
          setSession(data);
          setEditableCourseName(data.courseName);
          setEditableTopics(data.topics || []);
          setEditableAttemptsLimit(data.maxAnswerAttemptsPerQuestion || 1);
          setEditableQuestionsLimit(data.maxQuestionsPerStudent || 1);
          setEditableTopicQuestionsLimit(data.maxQuestionsPerTopicPerStudent || 1);
          setEditableMaxTopicsLimit(data.maxTopicsPerStudent || 0);
          setEditableThreshold(data.scoreThreshold || 75);
          setEditableTopCount(data.topCount || 2);
          setEditableSelectionMode(data.selectionMode || 'threshold_and_top_count');
          return;
        }
      }

      // If server could not be reached or returned non-JSON, preserve local session if code matches
      try {
        const stored = localStorage.getItem('edu_last_session');
        if (stored) {
          const localData: SessionInfo = JSON.parse(stored);
          if (localData && localData.code === codeToUse) {
            setSession(localData);
            setEditableCourseName(localData.courseName);
            setEditableTopics(localData.topics || []);
            setEditableAttemptsLimit(localData.maxAnswerAttemptsPerQuestion || 1);
            setEditableQuestionsLimit(localData.maxQuestionsPerStudent || 1);
            setEditableTopicQuestionsLimit(localData.maxQuestionsPerTopicPerStudent || 1);
            setEditableMaxTopicsLimit(localData.maxTopicsPerStudent || 0);
            setEditableThreshold(localData.scoreThreshold || 75);
            setEditableTopCount(localData.topCount || 2);
            setEditableSelectionMode(localData.selectionMode || 'threshold_and_top_count');
            return;
          }
        }
      } catch {}
      setSession(null);
    } catch {
      // Preserve local session if exists
      try {
        const stored = localStorage.getItem('edu_last_session');
        if (stored) {
          const localData: SessionInfo = JSON.parse(stored);
          if (localData) {
            setSession(localData);
            return;
          }
        }
      } catch {}
      setSession(null);
    } finally {
      setIsLoadingSession(false);
    }
  };

  // Direct save of Course Name, Topics, Threshold, TopCount, SelectionMode, and Limits for the active session
  const handleSaveSessionSettings = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!session) return;

    if (!editableCourseName.trim()) {
      setErrorMsg('Lütfen geçerli bir ders adı giriniz.');
      return;
    }

    if (editableTopics.length === 0) {
      setErrorMsg('Lütfen en az bir konu başlığı ekleyiniz.');
      return;
    }

    setIsSavingSettings(true);
    setSettingsSuccessMsg('');
    try {
      const res = await apiFetch(`/api/sessions/${session.code}/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          courseName: editableCourseName.trim(),
          topics: editableTopics,
          scoreThreshold: editableThreshold,
          topCount: editableTopCount,
          selectionMode: editableSelectionMode,
          maxAnswerAttemptsPerQuestion: editableAttemptsLimit,
          maxQuestionsPerStudent: editableQuestionsLimit,
          maxQuestionsPerTopicPerStudent: editableTopicQuestionsLimit,
          maxTopicsPerStudent: editableMaxTopicsLimit,
        }),
      });

      const data = await safeJson<SessionInfo>(res);
      if (!res.ok) {
        throw new Error((data as any)?.error || 'Ayarlar kaydedilemedi.');
      }

      if (data) {
        setSession(data);
      }
      setSettingsSuccessMsg('Oturum ayarları (Eşik, Sınırlar, Ders & Konular) başarıyla güncellendi!');
      setTimeout(() => setSettingsSuccessMsg(''), 4000);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Kaydedilemedi.');
    } finally {
      setIsSavingSettings(false);
    }
  };

  // Instant update of limits so student screens update immediately without needing full form submission
  const handleUpdateLimitInstant = async (
    type: 'attempts' | 'questions' | 'topicQuestions' | 'maxTopics',
    value: number
  ) => {
    if (!session) return;
    const clampedVal = type === 'maxTopics' ? Math.max(0, value) : Math.max(1, value);
    const newAttempts = type === 'attempts' ? clampedVal : editableAttemptsLimit;
    const newQuestions = type === 'questions' ? clampedVal : editableQuestionsLimit;
    const newTopicQuestions = type === 'topicQuestions' ? clampedVal : editableTopicQuestionsLimit;
    const newMaxTopics = type === 'maxTopics' ? clampedVal : editableMaxTopicsLimit;

    if (type === 'attempts') setEditableAttemptsLimit(clampedVal);
    if (type === 'questions') setEditableQuestionsLimit(clampedVal);
    if (type === 'topicQuestions') setEditableTopicQuestionsLimit(clampedVal);
    if (type === 'maxTopics') setEditableMaxTopicsLimit(clampedVal);

    try {
      const res = await apiFetch(`/api/sessions/${session.code}/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          courseName: editableCourseName.trim() || session.courseName,
          topics: editableTopics.length > 0 ? editableTopics : session.topics,
          scoreThreshold: editableThreshold,
          topCount: editableTopCount,
          selectionMode: editableSelectionMode,
          maxAnswerAttemptsPerQuestion: newAttempts,
          maxQuestionsPerStudent: newQuestions,
          maxQuestionsPerTopicPerStudent: newTopicQuestions,
          maxTopicsPerStudent: newMaxTopics,
        }),
      });
      if (res.ok) {
        const updated = await safeJson<SessionInfo>(res);
        if (updated) {
          setSession(updated);
        }
        setSettingsSuccessMsg(
          type === 'attempts'
            ? `Cevap verme hakkı anında güncellendi: ${clampedVal} hak / soru (Öğrenci ekranlarına iletildi)`
            : type === 'questions'
            ? `Genel soru giriş sınırı anında güncellendi: ${clampedVal} soru / öğrenci (Öğrenci ekranlarına iletildi)`
            : type === 'topicQuestions'
            ? `Konu başına soru sınırı anında güncellendi: ${clampedVal} soru / konu (Öğrenci ekranlarına iletildi)`
            : clampedVal === 0
            ? 'Öğrenci konu sınırı kaldırıldı (Öğrenciler tüm konulara soru hazırlayabilir)'
            : `Öğrencinin soru sorabileceği maksimum konu sayısı güncellendi: En fazla ${clampedVal} konu (Öğrenci ekranlarına iletildi)`
        );
        setTimeout(() => setSettingsSuccessMsg(''), 3000);
      }
    } catch (err) {
      console.error('Instant limit update error:', err);
    }
  };

  const handleAddTopic = () => {
    const trimmed = newTopicInput.trim();
    if (trimmed && !editableTopics.includes(trimmed)) {
      setEditableTopics([...editableTopics, trimmed]);
      setNewTopicInput('');
    }
  };

  const handleRemoveTopic = (indexToRemove: number) => {
    setEditableTopics(editableTopics.filter((_, idx) => idx !== indexToRemove));
  };

  useEffect(() => {
    loadSession(activeSessionCode);
  }, [activeSessionCode]);

  // Real-time polling for teacher dashboard (questions submitted, live quiz answers)
  useEffect(() => {
    if (!activeSessionCode) return;

    let isPolling = false;
    const interval = setInterval(async () => {
      if (isPolling) return;
      isPolling = true;
      try {
        const res = await apiFetch(`/api/sessions/${activeSessionCode}`);
        if (res.ok) {
          const updated = await safeJson<SessionInfo>(res);
          if (updated) {
            setSession(updated);

            // If in quiz mode, calculate live stats for active question
            if (updated.status === 'quiz_active') {
            const selectedQ = updated.questions.filter((q) => q.selectionStatus === 'Seçildi');
            const currentQ = selectedQ[updated.quizState.activeQuestionIndex];
            if (currentQ) {
              const answersForQ = updated.answers.filter((a) => a.questionId === currentQ.id);
              const counts = { total: answersForQ.length, A: 0, B: 0, C: 0, D: 0, E: 0 };
              for (const a of answersForQ) {
                if (counts[a.givenAnswer as keyof typeof counts] !== undefined) {
                  counts[a.givenAnswer as keyof typeof counts]++;
                }
              }
              setLiveQuizStats(counts);

              // Auto sync answers to Google Sheets in safe batches (debounced, no aggressive loops)
              if (autoSyncAnswers && updated.spreadsheetId && hasGoogleAuthToken) {
                const now = Date.now();
                if (!isSyncingAnswersRef.current && now - lastSyncErrorTimeRef.current > 20000) {
                  const unsynced = answersForQ.filter((a) => !syncedAnswerIdsRef.current.has(a.id));
                  if (unsynced.length > 0) {
                    isSyncingAnswersRef.current = true;
                    try {
                      await syncAnswersBatchToSheet(updated.spreadsheetId, unsynced);
                      unsynced.forEach((a) => syncedAnswerIdsRef.current.add(a.id));
                      setSyncedAnswerIds(new Set(syncedAnswerIdsRef.current));
                    } catch (syncErr: unknown) {
                      console.warn('Auto sync batch error:', syncErr);
                      lastSyncErrorTimeRef.current = Date.now();
                      const msg = syncErr instanceof Error ? syncErr.message : String(syncErr);
                      if (
                        msg.includes('401') ||
                        msg.includes('403') ||
                        msg.includes('PERMISSION_DENIED') ||
                        msg.includes('erişim anahtarı')
                      ) {
                        setAutoSyncAnswers(false);
                        setSheetCardError(
                          'Google Sheets senkronizasyonu durduruldu (Yetkilendirme süresi doldu veya izin yetersiz). Lütfen tekrar oturum açınız.'
                        );
                      }
                    } finally {
                      isSyncingAnswersRef.current = false;
                    }
                  }
                }
              }
            }
          }
        }
      }
    } catch (err) {
      // silent polling catch
    } finally {
      isPolling = false;
    }
    }, 3500);

    return () => clearInterval(interval);
  }, [activeSessionCode, autoSyncAnswers, hasGoogleAuthToken]);

  // Google Login Handler
  const handleGoogleLogin = async () => {
    setIsLoggingIn(true);
    setSheetCardError('');
    setSheetSyncSuccess('');
    try {
      const res = await googleSignIn();
      if (res?.user && res?.accessToken) {
        setGoogleUser(res.user);
        setHasGoogleAuthToken(true);
        setSheetSyncSuccess(`Google hesabınız (${res.user.email}) bağlandı! Artık "Yeni Google Sheet Oluştur" veya "Mevcut Google Sheet Seç / Bağla" ile tablonuzu bağlayabilirsiniz.`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes('auth/popup-closed-by-user') && !msg.includes('cancelled-popup-request')) {
        setSheetCardError('Google ile bağlantı kurulamadı: ' + msg);
        setErrorMsg('Google ile bağlantı kurulamadı: ' + msg);
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  // Ensure user is signed in with Google and has valid token before sheets actions
  const ensureGoogleAuth = async (): Promise<string | null> => {
    const existingToken = await getAccessToken();
    if (existingToken) return existingToken;

    setIsLoggingIn(true);
    setSheetCardError('');
    try {
      const res = await googleSignIn();
      if (res?.accessToken) {
        setGoogleUser(res.user);
        setHasGoogleAuthToken(true);
        return res.accessToken;
      }
      return null;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes('auth/popup-closed-by-user') && !msg.includes('cancelled-popup-request')) {
        setSheetCardError('Google yetkilendirmesi başarısız oldu: ' + msg);
        setErrorMsg('Google yetkilendirmesi başarısız oldu: ' + msg);
      }
      return null;
    } finally {
      setIsLoggingIn(false);
    }
  };

  // Export questions to CSV (UTF-8 with BOM for Excel compatibility)
  const handleExportQuestionsCsv = () => {
    if (!session || session.questions.length === 0) {
      setErrorMsg('İndirilecek soru bulunamadı.');
      return;
    }

    const headers = [
      'Ders Adı',
      'Öğrenci No',
      'Konu',
      'Soru',
      'Seçenek A',
      'Seçenek B',
      'Seçenek C',
      'Seçenek D',
      'Seçenek E',
      'Cevap',
      'Seçilme Durumu',
      'Analiz Skoru',
      'Session Kodu',
    ];

    const escapeCsv = (val: string | number | undefined) => {
      const str = String(val ?? '').replace(/"/g, '""');
      return `"${str}"`;
    };

    const rows = session.questions.map((q) => [
      escapeCsv(q.courseName),
      escapeCsv(q.studentNo),
      escapeCsv(q.topic),
      escapeCsv(q.question),
      escapeCsv(q.optionA),
      escapeCsv(q.optionB),
      escapeCsv(q.optionC),
      escapeCsv(q.optionD),
      escapeCsv(q.optionE),
      escapeCsv(q.answer),
      escapeCsv(q.selectionStatus),
      escapeCsv(q.analysisScore),
      escapeCsv(q.sessionCode),
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Sorular_${session.courseName}_${session.code}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Export answers to CSV (UTF-8 with BOM for Excel compatibility)
  const handleExportAnswersCsv = () => {
    if (!session || session.answers.length === 0) {
      setErrorMsg('İndirilecek cevap bulunamadı.');
      return;
    }

    const headers = [
      'Session Kodu',
      'Ders Adı',
      'Konu',
      'Soru No',
      'Soru',
      'Öğrenci No',
      'Verilen Cevap',
      'Doğru Cevap',
      'Durum',
      'Zaman Damgası',
    ];

    const escapeCsv = (val: string | number | undefined) => {
      const str = String(val ?? '').replace(/"/g, '""');
      return `"${str}"`;
    };

    const rows = session.answers.map((a) => [
      escapeCsv(a.sessionCode),
      escapeCsv(a.courseName),
      escapeCsv(a.topic),
      escapeCsv(`Soru ${a.questionIndex + 1}`),
      escapeCsv(a.questionText),
      escapeCsv(a.studentNo),
      escapeCsv(a.givenAnswer),
      escapeCsv(a.correctAnswer),
      escapeCsv(a.statusText),
      escapeCsv(a.timestamp),
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Cevaplar_${session.courseName}_${session.code}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Google Logout
  const handleGoogleLogout = async () => {
    await logout();
    setGoogleUser(null);
    setHasGoogleAuthToken(false);
  };

  // Create Google Spreadsheet
  const handleCreateGoogleSheet = async () => {
    setSheetCardError('');
    setSheetSyncSuccess('');

    let currentSession = session;
    if (!currentSession) {
      try {
        const autoRes = await apiFetch('/api/sessions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            courseName: 'Ders İçi Soru & Canlı Quiz',
            topics: ['Genel Konu'],
          }),
        });
        const createdSession = await safeJson<SessionInfo>(autoRes);
        if (autoRes.ok && createdSession) {
          currentSession = createdSession;
          setSession(createdSession);
          onSessionCodeChange(createdSession.code);
        }
      } catch (e) {
        console.warn('Auto create session failed:', e);
      }
    }

    if (!currentSession) {
      setSheetCardError('Lütfen önce yukarıdaki "Yeni Oturum Başlat" butonundan bir ders oturumu oluşturunuz.');
      return;
    }

    const token = await ensureGoogleAuth();
    if (!token) return;

    setIsCreatingSheet(true);
    try {
      const { id, url } = await createQuizSpreadsheet(currentSession.courseName, currentSession.code, token);
      
      // Link sheet with server session
      const linkRes = await apiFetch(`/api/sessions/${currentSession.code}/link-sheet`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spreadsheetId: id, spreadsheetUrl: url }),
      });

      const updated = await safeJson<SessionInfo>(linkRes);
      if (linkRes.ok && updated) {
        setSession(updated);
        if (updated.questions && updated.questions.length > 0) {
          await syncAllQuestionsWithUpdate(id, updated.questions, token);
        }
      } else {
        setSession((prev) => (prev ? { ...prev, spreadsheetId: id, spreadsheetUrl: url } : prev));
        if (currentSession.questions && currentSession.questions.length > 0) {
          await syncAllQuestionsWithUpdate(id, currentSession.questions, token);
        }
      }

      setSheetSyncSuccess('Google Sheet başarıyla oluşturuldu ve "Sorular" & "Cevaplar" sayfaları bağlandı!');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Google Sheet oluşturulamadı.';
      setSheetCardError(msg);
      setErrorMsg(msg);
    } finally {
      setIsCreatingSheet(false);
    }
  };

  // Open Existing Sheet Modal & fetch recent Drive spreadsheets
  const handleOpenExistingSheetModal = async () => {
    setExistingSheetModalError('');
    setSheetCardError('');
    setIsExistingSheetModalOpen(true);
    setExistingSheetInput('');
    setIsLoadingDriveSheets(true);
    try {
      const token = await ensureGoogleAuth();
      if (token) {
        const sheets = await listUserSpreadsheets(token);
        setRecentDriveSheets(sheets);
      }
    } catch (e) {
      console.warn('Could not list drive spreadsheets:', e);
    } finally {
      setIsLoadingDriveSheets(false);
    }
  };

  // Connect Existing Google Sheet
  const handleConnectExistingSheet = async (targetIdOrUrl?: string) => {
    setExistingSheetModalError('');
    setSheetCardError('');
    const input = targetIdOrUrl || existingSheetInput;
    if (!input || !input.trim()) {
      setExistingSheetModalError('Lütfen geçerli bir Google Sheet linki veya ID’si giriniz.');
      return;
    }

    let currentSession = session;
    if (!currentSession) {
      try {
        const autoRes = await apiFetch('/api/sessions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            courseName: 'Ders İçi Soru & Canlı Quiz',
            topics: ['Genel Konu'],
          }),
        });
        const createdSession = await safeJson<SessionInfo>(autoRes);
        if (autoRes.ok && createdSession) {
          currentSession = createdSession;
          setSession(createdSession);
          onSessionCodeChange(createdSession.code);
        }
      } catch (e) {
        console.warn('Auto create session failed:', e);
      }
    }

    if (!currentSession) {
      setExistingSheetModalError('Lütfen önce bir ders oturumu başlatınız.');
      return;
    }

    const token = await ensureGoogleAuth();
    if (!token) return;

    setIsConnectingExistingSheet(true);
    try {
      const sheet = await connectExistingSpreadsheet(input.trim(), token);

      // Save to backend session
      const res = await apiFetch(`/api/sessions/${currentSession.code}/link-sheet`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          spreadsheetId: sheet.id,
          spreadsheetUrl: sheet.url,
        }),
      });

      const updated = await safeJson<SessionInfo>(res);
      if (res.ok && updated) {
        setSession(updated);
        setIsExistingSheetModalOpen(false);
        if (updated.questions && updated.questions.length > 0) {
          await syncAllQuestionsWithUpdate(sheet.id, updated.questions, token);
        }
      } else {
        setSession((prev) => (prev ? { ...prev, spreadsheetId: sheet.id, spreadsheetUrl: sheet.url } : prev));
        setIsExistingSheetModalOpen(false);
        if (currentSession.questions && currentSession.questions.length > 0) {
          await syncAllQuestionsWithUpdate(sheet.id, currentSession.questions, token);
        }
      }

      setSheetSyncSuccess(
        `"${sheet.title}" başarıyla bağlandı! Önceki kayıtlarınız korunarak yeni soru ve cevaplar bu tabloya eklenmeye (append) devam edecektir.`
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setExistingSheetModalError('Mevcut Google Sheet bağlanırken hata: ' + msg);
      setSheetCardError('Mevcut Google Sheet bağlanırken hata: ' + msg);
    } finally {
      setIsConnectingExistingSheet(false);
    }
  };

  // Manual Sync to Google Sheet (Protected with confirmation modal per guidelines)
  const handleManualSyncClick = async () => {
    if (!session?.spreadsheetId) return;
    const token = await ensureGoogleAuth();
    if (!token) return;

    setConfirmModal({
      isOpen: true,
      title: 'Google Sheet Güncelleme',
      message: `Google Sheet belgenizdeki "Sorular" ve "Cevaplar" sekmeleri güncellenecektir. Bu işlem ${session.questions.length} adet soruyu ve ${session.answers.length} adet öğrenci cevabını tabloya işleyecektir. Onaylıyor musunuz?`,
      detail: `Tablo ID: ${session.spreadsheetId}`,
      confirmLabel: 'Evet, Tabloyu Güncelle',
      action: async () => {
        setIsSyncingSheets(true);
        setSheetCardError('');
        try {
          if (session.spreadsheetId) {
            await syncAllQuestionsWithUpdate(session.spreadsheetId, session.questions, token);
            if (session.answers.length > 0) {
              await syncAnswersBatchToSheet(session.spreadsheetId, session.answers, token);
            }
            setSheetSyncSuccess('Tüm sorular ve cevaplar Google Sheet ile başarıyla senkronize edildi!');
          }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : 'Senkronizasyon hatası.';
          setSheetCardError(msg);
          setErrorMsg(msg);
        } finally {
          setIsSyncingSheets(false);
        }
      },
    });
  };

  // Create New Session
  const handleCreateNewSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCourseName.trim()) return;

    setIsCreatingSession(true);
    try {
      const topics = newTopicsInput
        .split('\n')
        .map((t) => t.trim())
        .filter((t) => t.length > 0);

      const res = await apiFetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          courseName: newCourseName.trim(),
          topics: topics.length > 0 ? topics : ['Genel Konu'],
          scoreThreshold: newThreshold,
          topCount: newTopCount,
          selectionMode: newSelectionMode,
          maxAnswerAttemptsPerQuestion: newAttemptsLimit,
          maxQuestionsPerStudent: newQuestionsLimit,
          maxQuestionsPerTopicPerStudent: newTopicQuestionsLimit,
          maxTopicsPerStudent: newMaxTopicsLimit,
        }),
      });

      const created = await safeJson<SessionInfo & { error?: string }>(res);
      if (res.ok && created && created.code) {
        onSessionCodeChange(created.code);
        setSession(created);
      } else {
        // Fallback for standalone/Netlify static deployment without live backend
        const fallbackCode = Math.floor(10000 + Math.random() * 90000).toString();
        const fallbackSession: SessionInfo = {
          code: fallbackCode,
          courseName: newCourseName.trim(),
          topics: topics.length > 0 ? topics : ['Genel Konu'],
          scoreThreshold: newThreshold,
          topCount: newTopCount,
          selectionMode: newSelectionMode,
          maxAnswerAttemptsPerQuestion: newAttemptsLimit,
          maxQuestionsPerStudent: newQuestionsLimit,
          maxQuestionsPerTopicPerStudent: newTopicQuestionsLimit,
          maxTopicsPerStudent: newMaxTopicsLimit,
          status: 'collecting',
          createdAt: new Date().toISOString(),
          questions: [],
          quizState: {
            activeQuestionIndex: 0,
            showAnswer: false,
            isAcceptingAnswers: false,
          },
          answers: [],
        };
        onSessionCodeChange(fallbackCode);
        setSession(fallbackSession);
      }
      setIsNewSessionModalOpen(false);
      setNewCourseName('');
      setNewTopicsInput('');
      setNewAttemptsLimit(1);
      setNewQuestionsLimit(1);
      setNewTopicQuestionsLimit(1);
      setNewMaxTopicsLimit(0);
      setNewThreshold(75);
      setNewTopCount(2);
      setNewSelectionMode('threshold_and_top_count');
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Hata oluştu.');
    } finally {
      setIsCreatingSession(false);
    }
  };

  // Run Gemini Analysis (With optional custom evaluation criteria prompt)
  const handleRunGeminiAnalysis = async (criteria?: string) => {
    if (!session || session.questions.length === 0) {
      setErrorMsg('Analiz edebilmek için en az 1 soru bulunmalıdır.');
      return;
    }

    const effectiveCriteria = criteria !== undefined ? criteria : additionalPromptInput;

    setIsAnalyzingWithGemini(true);
    setAnalysisStatusText(
      effectiveCriteria?.trim()
        ? 'Google Gemini soruları ek değerlendirme kriterleriniz doğrultusunda yeniden inceliyor...'
        : 'Google Gemini soruları pedagojik kriterlerle inceliyor (doğruluk, çeldiriciler, netlik)...'
    );
    try {
      const res = await apiFetch(`/api/sessions/${session.code}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ additionalCriteria: effectiveCriteria }),
      });

      const result = await safeJson<{ session?: SessionInfo; error?: string }>(res);
      if (!res.ok || !result || !result.session) {
        throw new Error(result?.error || `Gemini analizi tamamlanamadı (HTTP ${res.status}).`);
      }

      setSession(result.session);
      // NOTE: Results are first reviewed on the teacher panel! We do NOT overwrite Google Sheet here.
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Gemini analizi hatası.');
    } finally {
      setIsAnalyzingWithGemini(false);
      setAnalysisStatusText('');
    }
  };

  // Finalize evaluation and write "Seçildi" / "Seçilmedi" to Google Sheet
  const handleFinalizeEvaluationAndSyncSheet = () => {
    if (!session) return;
    const selectedCount = session.questions.filter((q) => q.selectionStatus === 'Seçildi').length;
    const unselectedCount = session.questions.length - selectedCount;

    setConfirmModal({
      isOpen: true,
      title: 'Değerlendirmeyi Tamamla ve Google Sheet’e İşle',
      message: `Öğretmen incelemeniz tamamlandı olarak kaydedilecektir. ${selectedCount} adet soru "Seçildi", ${unselectedCount} adet soru ise "Seçilmedi" olarak Google Sheet tablonuzun "Sorular" sekmesinde işaretlenecektir. Onaylıyor musunuz?`,
      detail: session.spreadsheetId ? `Bağlı Google Sheet ID: ${session.spreadsheetId}` : 'Google Sheet henüz bağlı değilse veriler oturumda onaylanacak; Google ile bağlandığınızda aktarılacaktır.',
      confirmLabel: 'Evet, Onayla ve Sheet’e İşle',
      action: async () => {
        setIsFinalizingEvaluation(true);
        try {
          // 1. Mark finalized on server
          const finRes = await apiFetch(`/api/sessions/${session.code}/finalize-evaluation`, {
            method: 'POST',
          });
          const finData = await safeJson<{ session?: SessionInfo }>(finRes);
          if (finRes.ok && finData?.session) {
            setSession(finData.session);
          } else {
            setSession((prev) => (prev ? { ...prev, isEvaluationFinalized: true } : prev));
          }

          // 2. Sync to Google Sheets if connected
          if (session.spreadsheetId) {
            await syncAllQuestionsWithUpdate(session.spreadsheetId, session.questions);
            setSheetSyncSuccess(
              `Değerlendirme başarıyla tamamlandı! ${selectedCount} soru Google Sheet üzerinde "Seçildi" olarak işaretlendi.`
            );
          } else {
            setSheetSyncSuccess(
              'Değerlendirme onaylandı! Sonuçları Google Sheet’e aktarmak için yukarıdaki Google ile Giriş Yap butonunu kullanabilirsiniz.'
            );
          }
        } catch (err: unknown) {
          setErrorMsg('Google Sheet güncellenirken hata oluştu: ' + (err instanceof Error ? err.message : String(err)));
        } finally {
          setIsFinalizingEvaluation(false);
        }
      },
    });
  };

  // Update Threshold Score
  const handleUpdateThreshold = async (newVal: number) => {
    if (!session) return;
    try {
      const res = await apiFetch(`/api/sessions/${session.code}/threshold`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threshold: newVal }),
      });
      const updated = await safeJson<SessionInfo>(res);
      if (res.ok && updated) {
        setSession(updated);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Select top N questions by analysis score
  const handleSelectTopN = async (count: number) => {
    if (!session || session.questions.length === 0) return;
    const target = Math.max(1, Math.min(session.questions.length, count));
    setTopCountInput(target);
    try {
      const res = await apiFetch(`/api/sessions/${session.code}/select-top`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count: target }),
      });
      const data = await safeJson<{ session?: SessionInfo }>(res);
      if (res.ok && data?.session) {
        setSession(data.session);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Update configuration for a specific topic (threshold & topCount)
  const handleUpdateTopicConfig = async (
    topic: string,
    partialConfig: Partial<TopicConfig>
  ) => {
    if (!session) return;
    setUpdatingTopic(topic);
    try {
      const prev = session.topicConfigs?.[topic] || {
        scoreThreshold: session.scoreThreshold || 75,
        topCount: 1,
        selectionMode: 'threshold' as const,
      };
      const merged = { ...prev, ...partialConfig };
      const res = await apiFetch(`/api/sessions/${session.code}/topics/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic,
          scoreThreshold: merged.scoreThreshold,
          topCount: merged.topCount,
          selectionMode: merged.selectionMode,
          maxQuestionsLimit: merged.maxQuestionsLimit,
        }),
      });
      const data = await safeJson<{ session?: SessionInfo }>(res);
      if (res.ok && data?.session) {
        setSession(data.session);
      }
    } catch (err) {
      console.error('Failed to update topic config:', err);
    } finally {
      setUpdatingTopic(null);
    }
  };

  // Bulk apply a rule to all topics
  const handleApplyAllTopicsRule = async (
    mode: 'threshold_and_top_count' | 'threshold' | 'top_count',
    thresh: number,
    count: number
  ) => {
    if (!session) return;
    try {
      const allTopics = Array.from(
        new Set([...session.topics, ...session.questions.map((q) => q.topic)])
      ).filter(Boolean);
      const newConfigs: Record<string, TopicConfig> = {};
      for (const t of allTopics) {
        newConfigs[t] = {
          scoreThreshold: thresh,
          topCount: Math.max(1, count),
          selectionMode: mode,
        };
      }
      const res = await apiFetch(`/api/sessions/${session.code}/topics/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topicConfigs: newConfigs }),
      });
      const data = await safeJson<{ session?: SessionInfo }>(res);
      if (res.ok && data?.session) {
        setSession(data.session);
      }
    } catch (err) {
      console.error('Failed to apply rule to all topics:', err);
    }
  };

  const toggleTopicCollapse = (topic: string) => {
    setCollapsedTopics((prev) => ({ ...prev, [topic]: !prev[topic] }));
  };

  // Override question selection manually
  const handleToggleSelection = async (questionId: string, currentStatus: string) => {
    if (!session) return;
    const nextStatus = currentStatus === 'Seçildi' ? 'Seçilmedi' : 'Seçildi';
    try {
      const res = await apiFetch(`/api/sessions/${session.code}/override-selection`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questionId, status: nextStatus }),
      });
      const data = await safeJson<{ session?: SessionInfo }>(res);
      if (res.ok && data?.session) {
        setSession(data.session);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Start Live Quiz
  const handleStartQuiz = async () => {
    if (!session) return;
    const selectedCount = session.questions.filter((q) => q.selectionStatus === 'Seçildi').length;
    if (selectedCount === 0) {
      setErrorMsg('Quiz başlatabilmek için en az 1 sorunun "Seçildi" olarak işaretlenmiş olması gerekir.');
      return;
    }

    try {
      const res = await apiFetch(`/api/sessions/${session.code}/quiz/start`, {
        method: 'POST',
      });
      const updated = await safeJson<SessionInfo>(res);
      if (res.ok && updated) {
        setSession(updated);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Quiz Controls
  const handleQuizControl = async (action: string, index?: number) => {
    if (!session) return;
    try {
      const res = await apiFetch(`/api/sessions/${session.code}/quiz/control`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, index }),
      });
      const updated = await safeJson<SessionInfo>(res);
      if (res.ok && updated) {
        setSession(updated);

        // If quiz is finished, auto-sync answers to Google Sheet if connected
        if (action === 'finish') {
          if (session.spreadsheetId && updated.answers?.length > 0) {
            try {
              await syncAnswersBatchToSheet(session.spreadsheetId, updated.answers);
              setAnswersSyncSuccessMsg(`Quiz tamamlandı! ${updated.answers.length} adet geçerli öğrenci cevabı Google Sheet "Cevaplar" sekmesine otomatik aktarıldı.`);
            } catch (sheetErr) {
              console.warn('Google Sheet auto-sync error:', sheetErr);
            }
          }
          // Automatically trigger Gemini Quiz Report if there are answers
          if (updated.answers?.length > 0 && !updated.quizReport) {
            handleGenerateQuizReport();
          }
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Generate or refresh Quiz Analysis Report using Gemini
  const handleGenerateQuizReport = async () => {
    if (!session) return;
    setIsGeneratingQuizReport(true);
    try {
      const res = await apiFetch(`/api/sessions/${session.code}/generate-quiz-report`, {
        method: 'POST',
      });
      const data = await safeJson<{ session?: SessionInfo; error?: string }>(res);
      if (!res.ok || !data) {
        throw new Error(data?.error || `Rapor oluşturulamadı (HTTP ${res.status}).`);
      }
      if (data.session) {
        setSession(data.session);
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Rapor oluşturulamadı.');
    } finally {
      setIsGeneratingQuizReport(false);
    }
  };

  // Manual sync answers to Google Sheet
  const handleSyncAnswersToSheet = async () => {
    if (!session) return;
    if (!session.spreadsheetId) {
      setErrorMsg('Cevapları Google Sheet’e aktarmak için lütfen önce yukarıdan Google ile Giriş yapıp tabloyu bağlayınız.');
      return;
    }
    if (session.answers.length === 0) {
      setErrorMsg('Henüz oturumda kayıtlı bir öğrenci cevabı bulunmamaktadır.');
      return;
    }

    setIsSyncingAnswers(true);
    setAnswersSyncSuccessMsg('');
    try {
      await syncAnswersBatchToSheet(session.spreadsheetId, session.answers);
      setAnswersSyncSuccessMsg(
        `Tüm geçerli öğrenci cevapları (${session.answers.length} adet) Google Sheet "Cevaplar" sekmesine başarıyla aktarıldı.`
      );
    } catch (err: unknown) {
      setErrorMsg('Google Sheet aktarım hatası: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsSyncingAnswers(false);
    }
  };

  // Filtered Questions (Flat list)
  const filteredQuestions =
    session?.questions.filter((q) => {
      if (selectedTopicFilter === 'all') return true;
      if (selectedTopicFilter === 'selected') return q.selectionStatus === 'Seçildi';
      if (selectedTopicFilter === 'unselected') return q.selectionStatus === 'Seçilmedi';
      return q.topic === selectedTopicFilter;
    }) || [];

  // Selected questions for quiz
  const selectedQuestionsForQuiz =
    session?.questions.filter((q) => q.selectionStatus === 'Seçildi') || [];
  const currentQuizQ = selectedQuestionsForQuiz[session?.quizState.activeQuestionIndex ?? 0];

  // Distinct topics in session (from topics array and questions)
  const topicsList = useMemo(() => {
    return Array.from(
      new Set([...(session?.topics || []), ...(session?.questions.map((q) => q.topic) || [])])
    ).filter(Boolean);
  }, [session?.topics, session?.questions]);

  // Questions grouped by topic
  const questionsByTopic = useMemo(() => {
    return topicsList.map((topic) => {
      const allForTopic = (session?.questions || []).filter((q) => q.topic === topic);
      const selectedForTopic = allForTopic.filter((q) => q.selectionStatus === 'Seçildi');
      const unselectedForTopic = allForTopic.filter((q) => q.selectionStatus !== 'Seçildi');

      let visibleQuestions = allForTopic;
      if (selectedTopicFilter === 'selected') {
        visibleQuestions = selectedForTopic;
      } else if (selectedTopicFilter === 'unselected') {
        visibleQuestions = unselectedForTopic;
      }

      return {
        topic,
        totalCount: allForTopic.length,
        selectedCount: selectedForTopic.length,
        unselectedCount: unselectedForTopic.length,
        questions: visibleQuestions,
        config: session?.topicConfigs?.[topic] || {
          scoreThreshold: session?.scoreThreshold || 75,
          topCount: 1,
          selectionMode: 'threshold' as const,
        },
      };
    });
  }, [topicsList, session?.questions, session?.topicConfigs, session?.scoreThreshold, selectedTopicFilter]);

  // Copy PIN helper
  const handleCopyPin = () => {
    if (!session?.code) return;
    navigator.clipboard.writeText(session.code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  // Teacher Authentication Gate: Require Registration No & Password (verified server-side)
  if (!teacherAuth) {
    return (
      <TeacherLogin
        onSuccess={(teacher) => {
          try {
            localStorage.setItem('edu_teacher_auth', JSON.stringify(teacher));
          } catch (e) {
            console.error(e);
          }
          setTeacherAuth(teacher);
        }}
        onSwitchToStudent={onSwitchToStudentView ? () => onSwitchToStudentView(activeSessionCode) : undefined}
      />
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-6">
      {/* ERROR BANNER NOTIFICATION */}
      {errorMsg && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 rounded-2xl text-xs sm:text-sm font-medium flex items-center justify-between gap-3 animate-in fade-in shadow-xs">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorMsg('')}
            className="p-1 hover:bg-rose-100 rounded-lg text-rose-600 cursor-pointer font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {/* HEADER BAR */}
      <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200/80 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-linear-to-br from-indigo-500 to-indigo-700 text-white rounded-2xl flex items-center justify-center font-black text-xl shadow-md">
            {session?.code || '—'}
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                {session?.courseName || 'Aktif Oturum Yok'}
              </h1>
              {session?.code && (
                <span className="px-2.5 py-0.5 text-xs font-bold bg-indigo-50 text-indigo-700 rounded-full border border-indigo-100">
                  PIN: {session.code}
                </span>
              )}
            </div>
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
              Ders İçi Soru Toplama, Gemini Değerlendirme & Canlı Quiz Yönetimi
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {session?.code && (
            <button
              onClick={handleCopyPin}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
              title="Oturum Kodunu Kopyala"
            >
              {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedCode ? 'Kopyalandı' : 'Kodu Kopyala'}</span>
            </button>
          )}

          {onSwitchToStudentView && session?.code && (
            <button
              onClick={() => onSwitchToStudentView(session.code)}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
            >
              <Users className="w-3.5 h-3.5" />
              <span>Öğrenci Gözüyle Aç</span>
            </button>
          )}

          {session && session.answers.length > 0 && session.status !== 'finished' && (
            <button
              onClick={() => setShowLiveReportModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 rounded-xl text-xs font-bold transition-colors cursor-pointer"
              title="Quiz Analiz Raporunu İncele"
            >
              <BarChart3 className="w-3.5 h-3.5" />
              <span>Analiz Raporu</span>
            </button>
          )}

          <button
            onClick={() => setIsNewSessionModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-xs transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Yeni Oturum Başlat</span>
          </button>

          {/* Teacher Profile & Logout */}
          <div className="flex items-center gap-2 pl-2 border-l border-slate-200/80">
            <div className="flex items-center gap-1.5 px-3 py-2 bg-indigo-50 border border-indigo-200 text-indigo-900 rounded-xl text-xs font-bold">
              <UserCheck className="w-3.5 h-3.5 text-indigo-600" />
              <span>Sicil: {teacherAuth.registrationNo}</span>
            </div>
            <button
              type="button"
              onClick={() => {
                localStorage.removeItem('edu_teacher_auth');
                setTeacherAuth(null);
              }}
              className="inline-flex items-center gap-1 px-2.5 py-2 text-slate-500 hover:text-rose-600 hover:bg-rose-50 border border-slate-200 hover:border-rose-200 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
              title="Öğretmen Oturumunu Kapat"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Çıkış</span>
            </button>
          </div>
        </div>
      </div>

      {/* EMPTY STATE IF NO ACTIVE SESSION */}
      {!session && !isLoadingSession && (
        <div className="bg-white rounded-3xl p-10 sm:p-14 shadow-xs border border-slate-200/80 text-center space-y-6">
          <div className="w-20 h-20 bg-indigo-50 text-indigo-600 rounded-3xl flex items-center justify-center mx-auto shadow-inner border border-indigo-100">
            <GraduationCap className="w-10 h-10" />
          </div>
          <div className="max-w-md mx-auto space-y-2">
            <h2 className="text-2xl font-black text-slate-900">
              Henüz Başlatılmış Bir Oturum Bulunmuyor
            </h2>
            <p className="text-sm text-slate-500 leading-relaxed">
              Öğrencilerin günün konularına ilişkin soru hazırlayıp gönderebilmesi ve sınıf içi canlı quiz uygulayabilmeniz için yeni bir oturum oluşturunuz.
            </p>
          </div>
          <div className="pt-2">
            <button
              type="button"
              onClick={() => setIsNewSessionModalOpen(true)}
              className="inline-flex items-center gap-2 px-6 py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl text-sm font-bold shadow-md transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Yeni Ders Oturumu Başlat</span>
            </button>
          </div>
        </div>
      )}

      {/* SESSION SETTINGS: DERS ADI VE KONU BAŞLIKLARI BELİRLEME FORMU */}
      {session && (
        <div className="bg-white rounded-3xl p-5 sm:p-6 shadow-xs border border-slate-200/90 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center">
                <Sliders className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Oturum Yapılandırması: Ders Adı & Günün Konu Başlıkları
                </h3>
                <p className="text-xs text-slate-500">
                  Öğrencilerin bu oturumda soru hazırlayabileceği ders adı ve konu başlıklarını buradan belirleyip güncelleyebilirsiniz.
                </p>
              </div>
            </div>

            {settingsSuccessMsg && (
              <span className="px-3 py-1 bg-emerald-100 text-emerald-800 text-xs font-semibold rounded-lg flex items-center gap-1.5 animate-in fade-in">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                {settingsSuccessMsg}
              </span>
            )}
          </div>

          <form onSubmit={handleSaveSessionSettings} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
              {/* Ders Adı Form Alanı */}
              <div className="md:col-span-5">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Ders Adı
                </label>
                <input
                  type="text"
                  required
                  value={editableCourseName}
                  onChange={(e) => setEditableCourseName(e.target.value)}
                  placeholder="Örn: Biyoloji 101, Veri Yapıları..."
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-800 focus:bg-white focus:border-indigo-600 outline-hidden"
                />
              </div>

              {/* Yeni Konu Ekleme Alanı */}
              <div className="md:col-span-7">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Yeni Konu Başlığı Ekle
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={newTopicInput}
                    onChange={(e) => setNewTopicInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddTopic();
                      }
                    }}
                    placeholder="Konu başlığı yazıp Enter'a basınız..."
                    className="flex-1 px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-800 focus:bg-white focus:border-indigo-600 outline-hidden"
                  />
                  <button
                    type="button"
                    onClick={handleAddTopic}
                    className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-xl transition-colors cursor-pointer shrink-0"
                  >
                    + Konu Ekle
                  </button>
                </div>
              </div>
            </div>

            {/* Konu Başlıkları Listesi / Tag Chips */}
            <div>
              <span className="block text-xs font-semibold text-slate-600 mb-2">
                Tanımlı Konu Başlıkları ({editableTopics.length}):
              </span>
              <div className="flex flex-wrap gap-2">
                {editableTopics.map((topic, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1.5 px-3 py-1 bg-indigo-50 border border-indigo-200 text-indigo-800 text-xs font-medium rounded-lg"
                  >
                    <span>{topic}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveTopic(idx)}
                      className="text-indigo-400 hover:text-indigo-700 hover:bg-indigo-100 rounded-full w-4 h-4 flex items-center justify-center cursor-pointer text-xs"
                      title="Konuyu Kaldır"
                    >
                      ✕
                    </button>
                  </span>
                ))}
              </div>
            </div>

            {/* Soru Seçim Kriteri: Eşik ve En İyi Skoru Alan Soru Adedi Ayarı */}
            <div className="p-4 bg-linear-to-r from-indigo-50/70 via-white to-purple-50/60 border border-indigo-200/80 rounded-2xl space-y-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-indigo-100 pb-2.5">
                <div>
                  <label className="block text-xs font-bold text-indigo-950 uppercase tracking-wider">
                    Soru Seçim Kriteri: Eşik ve En İyi Skoru Alan Soru Adedi
                  </label>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Oturumda Gemini analizi sonrasında hangi soruların seçileceğini belirler.
                  </p>
                </div>

                {/* Mode Selector */}
                <div className="inline-flex p-1 bg-white border border-indigo-200 rounded-xl text-xs font-semibold shadow-2xs">
                  <button
                    type="button"
                    onClick={() => setEditableSelectionMode('threshold_and_top_count')}
                    className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                      editableSelectionMode === 'threshold_and_top_count'
                        ? 'bg-indigo-600 text-white shadow-xs font-bold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    🎯 Eşik VE En İyi N Soru (Birleşik)
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditableSelectionMode('threshold')}
                    className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                      editableSelectionMode === 'threshold'
                        ? 'bg-indigo-600 text-white shadow-xs font-bold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    📊 Yalnızca Skor Eşiği
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditableSelectionMode('top_count')}
                    className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                      editableSelectionMode === 'top_count'
                        ? 'bg-indigo-600 text-white shadow-xs font-bold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    🏆 Yalnızca En İyi N Soru
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                {/* Eşik Ayarı */}
                {(editableSelectionMode === 'threshold' ||
                  editableSelectionMode === 'threshold_and_top_count') && (
                  <div className="space-y-1.5 bg-white p-3 rounded-xl border border-slate-200/80">
                    <div className="flex items-center justify-between text-xs font-bold text-slate-800">
                      <span>Analiz Skoru Puan Eşiği:</span>
                      <span className="font-mono text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-md">
                        %{editableThreshold}
                      </span>
                    </div>
                    <input
                      type="range"
                      min="50"
                      max="95"
                      step="5"
                      value={editableThreshold}
                      onChange={(e) => setEditableThreshold(Number(e.target.value))}
                      className="w-full accent-indigo-600 cursor-pointer"
                    />
                    <p className="text-[11px] text-slate-500">
                      En az <strong>%{editableThreshold}</strong> puan alan sorular değerlendirilir.
                    </p>
                  </div>
                )}

                {/* Belirli Adette Soru Ayarı (Top N) */}
                {(editableSelectionMode === 'top_count' ||
                  editableSelectionMode === 'threshold_and_top_count') && (
                  <div className="space-y-1.5 bg-white p-3 rounded-xl border border-slate-200/80">
                    <div className="flex items-center justify-between text-xs font-bold text-slate-800">
                      <span>En İyi Skoru Alan Soru Adedi (Top N):</span>
                      <span className="font-mono text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-md">
                        {editableTopCount} Soru / Konu
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-xl px-2 py-0.5">
                        <button
                          type="button"
                          onClick={() => setEditableTopCount(Math.max(1, editableTopCount - 1))}
                          className="w-6 h-6 flex items-center justify-center font-bold text-slate-600 hover:bg-slate-200 rounded-md cursor-pointer"
                        >
                          -
                        </button>
                        <span className="w-8 text-center text-xs font-black text-indigo-700 font-mono">
                          {editableTopCount}
                        </span>
                        <button
                          type="button"
                          onClick={() => setEditableTopCount(Math.min(20, editableTopCount + 1))}
                          className="w-6 h-6 flex items-center justify-center font-bold text-slate-600 hover:bg-slate-200 rounded-md cursor-pointer"
                        >
                          +
                        </button>
                      </div>

                      {[1, 2, 3, 5].map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => setEditableTopCount(preset)}
                          className={`px-2.5 py-1 text-xs font-semibold rounded-lg border transition-colors cursor-pointer ${
                            editableTopCount === preset
                              ? 'bg-indigo-600 text-white border-indigo-600 font-bold'
                              : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          {preset} Soru
                        </button>
                      ))}
                    </div>
                    <p className="text-[11px] text-slate-500">
                      {editableSelectionMode === 'threshold_and_top_count'
                        ? `%${editableThreshold} eşiğini geçenler arasından en yüksek skorlu ilk ${editableTopCount} soru seçilir.`
                        : `Her konudan en yüksek puana sahip ilk ${editableTopCount} soru seçilir.`}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Soru Başına Cevap Verme Hakkı Sınırı */}
            <div className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-2xl flex flex-wrap items-center justify-between gap-3">
              <div className="max-w-md">
                <div className="flex items-center gap-2">
                  <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider">
                    Soru Başına Cevap Verme Hakkı Sınırı
                  </label>
                  <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full">
                    Anında Etkili
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Öğrencilerin canlı quiz esnasında her soru için en fazla kaç kez cevap gönderebileceğini belirler.
                  Değiştirildiğinde öğrenci ekranında anında geçerli olur.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={editableAttemptsLimit}
                  onChange={(e) => {
                    const val = Math.max(1, Number(e.target.value) || 1);
                    handleUpdateLimitInstant('attempts', val);
                  }}
                  className="w-20 px-3 py-1.5 text-center font-bold font-mono bg-white border border-slate-300 rounded-xl text-sm text-indigo-700 outline-hidden focus:border-indigo-600"
                />
                <span className="text-xs font-semibold text-slate-600 mr-1">Hak / Soru</span>
                <div className="flex items-center gap-1">
                  {[1, 2, 3].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => handleUpdateLimitInstant('attempts', preset)}
                      className={`px-2 py-1 text-xs font-semibold rounded-lg border transition-colors cursor-pointer ${
                        editableAttemptsLimit === preset
                          ? 'bg-indigo-600 text-white border-indigo-600 font-bold'
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Öğrenci Başına Soru Yükleme Sınırı */}
            <div className="p-3.5 bg-indigo-50/50 border border-indigo-200/80 rounded-2xl flex flex-wrap items-center justify-between gap-3">
              <div className="max-w-md">
                <div className="flex items-center gap-2">
                  <label className="block text-xs font-bold text-indigo-950 uppercase tracking-wider">
                    Öğrenci Başına Soru Giriş Sınırı (Varsayılan: 1)
                  </label>
                  <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full">
                    Anında Etkili
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Öğrencilerin bu oturumda form üzerinden tek tek en fazla kaç soru gönderebileceğini belirler (Varsayılan: 1).
                  Değiştirildiğinde öğrenci ekranında kalan hak ve soru formu kilidi anında güncellenir.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl px-2 py-0.5 shadow-2xs">
                  <button
                    type="button"
                    onClick={() => handleUpdateLimitInstant('questions', Math.max(1, editableQuestionsLimit - 1))}
                    className="w-6 h-6 flex items-center justify-center font-bold text-slate-600 hover:bg-slate-100 rounded-md cursor-pointer"
                  >
                    -
                  </button>
                  <span className="w-8 text-center text-xs font-black text-indigo-700 font-mono">
                    {editableQuestionsLimit}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleUpdateLimitInstant('questions', Math.min(20, editableQuestionsLimit + 1))}
                    className="w-6 h-6 flex items-center justify-center font-bold text-slate-600 hover:bg-slate-100 rounded-md cursor-pointer"
                  >
                    +
                  </button>
                </div>
                <span className="text-xs font-semibold text-slate-600 mr-1">Soru / Öğrenci</span>
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 5].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => handleUpdateLimitInstant('questions', preset)}
                      className={`px-2 py-1 text-xs font-semibold rounded-lg border transition-colors cursor-pointer ${
                        editableQuestionsLimit === preset
                          ? 'bg-indigo-600 text-white border-indigo-600 font-bold'
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Konu Başına Soru Sorma Sınırı */}
            <div className="p-3.5 bg-emerald-50/50 border border-emerald-200/80 rounded-2xl flex flex-wrap items-center justify-between gap-3">
              <div className="max-w-md">
                <div className="flex items-center gap-2">
                  <label className="block text-xs font-bold text-emerald-950 uppercase tracking-wider">
                    Konu Başına Soru Sorma Sınırı
                  </label>
                  <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full">
                    Anında Etkili
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Öğrencilerin her konu başlığı için en fazla kaç soru gönderebileceğini belirler (Varsayılan: 1).
                  Değiştirildiğinde öğrenci ekranındaki konu seçimi ve form kilit durumu anında güncellenir.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl px-2 py-0.5 shadow-2xs">
                  <button
                    type="button"
                    onClick={() => handleUpdateLimitInstant('topicQuestions', Math.max(1, editableTopicQuestionsLimit - 1))}
                    className="w-6 h-6 flex items-center justify-center font-bold text-slate-600 hover:bg-slate-100 rounded-md cursor-pointer"
                  >
                    -
                  </button>
                  <span className="w-8 text-center text-xs font-black text-emerald-700 font-mono">
                    {editableTopicQuestionsLimit}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleUpdateLimitInstant('topicQuestions', Math.min(10, editableTopicQuestionsLimit + 1))}
                    className="w-6 h-6 flex items-center justify-center font-bold text-slate-600 hover:bg-slate-100 rounded-md cursor-pointer"
                  >
                    +
                  </button>
                </div>
                <span className="text-xs font-semibold text-slate-600 mr-1">Soru / Konu</span>
                <div className="flex items-center gap-1">
                  {[1, 2, 3].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => handleUpdateLimitInstant('topicQuestions', preset)}
                      className={`px-2 py-1 text-xs font-semibold rounded-lg border transition-colors cursor-pointer ${
                        editableTopicQuestionsLimit === preset
                          ? 'bg-emerald-600 text-white border-emerald-600 font-bold'
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Öğrenci Başına Maksimum Konu Sayısı Sınırı */}
            <div className="p-3.5 bg-purple-50/50 border border-purple-200/80 rounded-2xl flex flex-wrap items-center justify-between gap-3">
              <div className="max-w-md">
                <div className="flex items-center gap-2">
                  <label className="block text-xs font-bold text-purple-950 uppercase tracking-wider">
                    Öğrencinin Soru Sorabileceği Maksimum Konu Sayısı
                  </label>
                  <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full">
                    Anında Etkili
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Bir öğrencinin en fazla kaç farklı konuya soru gönderebileceğini belirler (0 = Sınırsız / Tüm Konular).
                  Örneğin 1 seçilirse bir öğrenci yalnızca tek bir konuya soru yükleyebilir.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl px-2 py-0.5 shadow-2xs">
                  <button
                    type="button"
                    onClick={() => handleUpdateLimitInstant('maxTopics', Math.max(0, editableMaxTopicsLimit - 1))}
                    className="w-6 h-6 flex items-center justify-center font-bold text-slate-600 hover:bg-slate-100 rounded-md cursor-pointer"
                  >
                    -
                  </button>
                  <span className="w-14 text-center text-xs font-black text-purple-700 font-mono">
                    {editableMaxTopicsLimit === 0 ? 'Tümü' : `${editableMaxTopicsLimit} Konu`}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleUpdateLimitInstant('maxTopics', Math.min(20, editableMaxTopicsLimit + 1))}
                    className="w-6 h-6 flex items-center justify-center font-bold text-slate-600 hover:bg-slate-100 rounded-md cursor-pointer"
                  >
                    +
                  </button>
                </div>
                <div className="flex items-center gap-1">
                  {[
                    { label: 'Tümü', val: 0 },
                    { label: '1 Konu', val: 1 },
                    { label: '2 Konu', val: 2 },
                    { label: '3 Konu', val: 3 },
                  ].map((preset) => (
                    <button
                      key={preset.val}
                      type="button"
                      onClick={() => handleUpdateLimitInstant('maxTopics', preset.val)}
                      className={`px-2 py-1 text-xs font-semibold rounded-lg border transition-colors cursor-pointer ${
                        editableMaxTopicsLimit === preset.val
                          ? 'bg-purple-600 text-white border-purple-600 font-bold'
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="submit"
                disabled={isSavingSettings}
                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer disabled:opacity-50"
              >
                {isSavingSettings ? 'Kaydediliyor...' : 'Tüm Ayarları Kaydet'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* GOOGLE SHEETS INTEGRATION CARD */}
      <div className="bg-linear-to-r from-emerald-50/60 via-white to-teal-50/40 rounded-3xl p-5 sm:p-6 border border-emerald-200/80 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-start gap-3.5 max-w-xl">
          <div className="w-11 h-11 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0 shadow-inner">
            <FileSpreadsheet className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-base font-bold text-slate-900">Google Sheets Entegrasyonu</h3>
              
              {/* Google Account Status Badge */}
              {googleUser ? (
                <span className="px-2.5 py-0.5 bg-emerald-100 text-emerald-800 text-xs font-bold rounded-md flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Google Hesabı Bağlı
                </span>
              ) : (
                <span className="px-2.5 py-0.5 bg-amber-100 text-amber-800 text-xs font-medium rounded-md">
                  Google Girişi Bekleniyor
                </span>
              )}

              {/* Spreadsheet Connection Status Badge */}
              {session?.spreadsheetId ? (
                <span className="px-2.5 py-0.5 bg-teal-100 text-teal-800 text-xs font-bold rounded-md flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-teal-600" /> E-Tablo Bağlı
                </span>
              ) : (
                <span className="px-2.5 py-0.5 bg-slate-100 text-slate-700 text-xs font-medium rounded-md">
                  E-Tablo Seçilmedi
                </span>
              )}
            </div>

            <p className="text-xs text-slate-600 mt-1">
              {googleUser && !session?.spreadsheetId ? (
                <span className="text-emerald-700 font-medium">
                  Google hesabınız doğrulandı. Soru ve cevapların otomatik aktarılması için lütfen <strong>"Yeni Google Sheet Oluştur"</strong> veya <strong>"Mevcut Google Sheet Seç / Bağla"</strong> butonuna tıklayınız.
                </span>
              ) : session?.spreadsheetId ? (
                <span>
                  Yüklenen sorular <strong>"Sorular"</strong> sekmesinde; öğrencilerin canlı quiz esnasında verdiği cevaplar ise{' '}
                  <strong>"Cevaplar"</strong> sekmesinde zaman damgalı olarak otomatik saklanır.
                </span>
              ) : (
                <span>
                  Google hesabınızı bağlayarak yeni bir e-tablo oluşturabilir veya mevcut e-tablonuzu bu derse bağlayabilirsiniz.
                </span>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {googleUser ? (
            <div className="text-xs text-slate-600 bg-white/80 px-3 py-1.5 rounded-xl border border-slate-200 flex items-center gap-2">
              <span className="font-semibold text-slate-800">{googleUser.email}</span>
              <button
                onClick={handleGoogleLogout}
                className="text-rose-600 hover:underline cursor-pointer"
              >
                Çıkış
              </button>
            </div>
          ) : (
            <GoogleSignInButton onClick={handleGoogleLogin} isLoading={isLoggingIn} />
          )}

          {!session?.spreadsheetId ? (
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={handleCreateGoogleSheet}
                disabled={isCreatingSheet || isConnectingExistingSheet || isLoggingIn}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer disabled:opacity-60"
              >
                {isCreatingSheet ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Plus className="w-4 h-4" />
                )}
                <span>Yeni Google Sheet Oluştur</span>
              </button>

              <button
                onClick={handleOpenExistingSheetModal}
                disabled={isCreatingSheet || isConnectingExistingSheet || isLoggingIn}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer disabled:opacity-60"
              >
                <Link2 className="w-4 h-4" />
                <span>Mevcut Google Sheet Seç / Bağla</span>
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 flex-wrap">
              <a
                href={session.spreadsheetUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Google Sheet'i Aç</span>
              </a>

              <button
                onClick={handleManualSyncClick}
                disabled={isSyncingSheets}
                className="inline-flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-semibold rounded-xl transition-colors cursor-pointer"
                title="Google Sheet'e Manuel Senkronize Et"
              >
                <FolderSync className={`w-3.5 h-3.5 ${isSyncingSheets ? 'animate-spin' : ''}`} />
                <span>{isSyncingSheets ? 'Senkronize Ediliyor...' : 'Tabloyu Güncelle'}</span>
              </button>

              <button
                onClick={handleOpenExistingSheetModal}
                className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-colors cursor-pointer"
                title="Farklı bir Google Sheet bağla"
              >
                <Link2 className="w-3.5 h-3.5" />
                <span>Tabloyu Değiştir</span>
              </button>
            </div>
          )}

          {/* Quick CSV Export Buttons for Offline Use */}
          <div className="flex items-center gap-2 border-l border-slate-200/80 pl-2.5">
            <button
              onClick={handleExportQuestionsCsv}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-colors cursor-pointer"
              title="Soruları CSV Olarak İndir (Excel Uyumlu)"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Sorular (.CSV)</span>
            </button>
            <button
              onClick={handleExportAnswersCsv}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-colors cursor-pointer"
              title="Cevapları CSV Olarak İndir (Excel Uyumlu)"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Cevaplar (.CSV)</span>
            </button>
          </div>
        </div>

        {/* In-Card Error notification banner */}
        {sheetCardError && (
          <div className="w-full text-xs text-rose-800 bg-rose-50 border border-rose-200 px-3.5 py-2.5 rounded-xl flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{sheetCardError}</span>
            </div>
            <button
              onClick={() => setSheetCardError('')}
              className="text-rose-700 hover:text-rose-900 font-bold ml-2 cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}

        {/* In-Card Success notification banner */}
        {sheetSyncSuccess && (
          <div className="w-full text-xs text-emerald-800 bg-emerald-100/70 border border-emerald-200 px-3.5 py-2 rounded-xl flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>{sheetSyncSuccess}</span>
            </div>
            <button
              onClick={() => setSheetSyncSuccess('')}
              className="text-emerald-700 hover:text-emerald-900 font-bold ml-2 cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}
      </div>

      {/* SESSION STAGE ROUTER */}

      {/* STAGE 1 & 2: QUESTION COLLECTION & GEMINI SELECTION */}
      {session && (session.status === 'collecting' || session.status === 'analyzing' || session.status === 'selection_review') && (
        <div className="space-y-6">
          {/* Top Big PIN Screen for Projector / Class Screen */}
          <div className="bg-linear-to-br from-slate-900 via-indigo-950 to-slate-900 text-white rounded-3xl p-6 sm:p-8 shadow-xl relative overflow-hidden">
            <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-6">
              <div className="text-center md:text-left space-y-2">
                <div className="inline-flex items-center gap-2 px-3 py-1 bg-indigo-500/20 text-indigo-300 rounded-full text-xs font-semibold border border-indigo-500/30">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
                  Öğrenciler İçin Katılım Kodu
                </div>
                <h2 className="text-3xl sm:text-4xl font-black tracking-tight">
                  Oturum Kodu: <span className="font-mono text-emerald-400">{session.code}</span>
                </h2>
                <p className="text-sm text-slate-300 max-w-xl">
                  Öğrenciler bu 5 haneli kod ile sisteme girerek bugün işlenen konular için 5 seçenekli birer soru yüklerler.
                </p>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  <span className="text-xs text-slate-400 mr-1 self-center">Günün Konuları:</span>
                  {topicsList.map((t, i) => (
                    <span
                      key={i}
                      className="px-2.5 py-0.5 bg-white/10 text-white text-xs font-medium rounded-lg border border-white/10"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </div>

              {/* Action: Run Gemini Analysis or Start Quiz */}
              <div className="flex flex-col gap-3 w-full md:w-auto shrink-0">
                {session.status === 'collecting' && (
                  <button
                    onClick={() => handleRunGeminiAnalysis()}
                    disabled={isAnalyzingWithGemini || session.questions.length === 0}
                    className="px-6 py-4 bg-linear-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 active:from-emerald-700 active:to-teal-700 text-white font-bold rounded-2xl shadow-lg transition-all flex items-center justify-center gap-2.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                  >
                    {isAnalyzingWithGemini ? (
                      <>
                        <Sparkles className="w-5 h-5 animate-spin" />
                        <span>Gemini Analiz Yapıyor...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-5 h-5" />
                        <span>Soru Kabulünü Bitir ve Gemini İle Analiz Et</span>
                      </>
                    )}
                  </button>
                )}

                {session.status === 'selection_review' && (
                  <div className="flex items-center gap-2.5 flex-wrap">
                    {!session.isEvaluationFinalized && (
                      <button
                        onClick={handleFinalizeEvaluationAndSyncSheet}
                        disabled={isFinalizingEvaluation}
                        className="px-5 py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-2xl shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer text-sm"
                      >
                        <Check className="w-4 h-4" />
                        <span>Değerlendirmeyi Tamamla & Sheet'e İşle</span>
                      </button>
                    )}
                    <button
                      onClick={handleStartQuiz}
                      disabled={selectedQuestionsForQuiz.length === 0}
                      className="px-6 py-3.5 bg-linear-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white font-bold rounded-2xl shadow-lg transition-all flex items-center justify-center gap-2.5 cursor-pointer text-sm"
                    >
                      <Play className="w-4 h-4 fill-current" />
                      <span>Canlı Quizi Başlat ({selectedQuestionsForQuiz.length} Seçilen Soru)</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* GEMINI ANALYSIS IN-PROGRESS LOADER CARD */}
          {(isAnalyzingWithGemini || session.status === 'analyzing') && (
            <div className="relative overflow-hidden rounded-3xl bg-linear-to-br from-indigo-900 via-indigo-950 to-slate-950 text-white p-6 sm:p-8 shadow-xl border border-indigo-500/30 animate-in fade-in zoom-in-95 duration-300">
              {/* Animated ambient background light */}
              <div className="absolute -top-24 -left-24 w-72 h-72 bg-indigo-500/20 rounded-full blur-3xl pointer-events-none animate-pulse"></div>
              <div className="absolute -bottom-24 -right-24 w-72 h-72 bg-purple-500/20 rounded-full blur-3xl pointer-events-none animate-pulse"></div>

              <div className="relative z-10 flex flex-col md:flex-row items-center gap-6 text-center md:text-left">
                {/* Spinner Icon with pulsing rings */}
                <div className="relative shrink-0 flex items-center justify-center">
                  <div className="w-20 h-20 rounded-2xl bg-indigo-600/30 border border-indigo-400/40 flex items-center justify-center shadow-lg shadow-indigo-500/20">
                    <Sparkles className="w-10 h-10 text-indigo-300 animate-spin" />
                  </div>
                  <span className="absolute -top-1 -right-1 flex h-4 w-4">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-4 w-4 bg-emerald-500"></span>
                  </span>
                </div>

                {/* Content & Dynamic Status */}
                <div className="space-y-3 flex-1">
                  <div className="flex flex-wrap items-center justify-center md:justify-start gap-2">
                    <span className="px-3 py-1 rounded-full text-xs font-bold bg-indigo-500/30 text-indigo-200 border border-indigo-400/30 inline-flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
                      Google Gemini 3.8 Flash Aktif
                    </span>
                    <span className="px-3 py-1 rounded-full text-xs font-semibold bg-white/10 text-slate-300">
                      {session.questions.length} Soru Taranıyor
                    </span>
                  </div>

                  <h3 className="text-xl sm:text-2xl font-black tracking-tight text-white">
                    Google Gemini Soruları Analiz Ediyor...
                  </h3>

                  <p className="text-sm text-indigo-200/90 leading-relaxed max-w-2xl">
                    {analysisStatusText || 'Sorular pedagojik ölçütler, çeldirici kalitesi ve bilimsel doğruluk yönünden inceleniyor.'}
                  </p>

                  {/* Animated Progress Bar */}
                  <div className="w-full bg-white/10 rounded-full h-2.5 overflow-hidden border border-white/10 mt-3">
                    <div className="bg-linear-to-r from-emerald-400 via-indigo-400 to-purple-400 h-full w-full animate-pulse"></div>
                  </div>

                  {/* 3 Step Criteria Indicator */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2 text-xs text-indigo-200/80">
                    <div className="flex items-center gap-2 bg-white/5 px-3 py-2 rounded-xl border border-white/5">
                      <div className="w-2 h-2 rounded-full bg-emerald-400"></div>
                      <span>1. Soru kökleri & bilimsel netlik</span>
                    </div>
                    <div className="flex items-center gap-2 bg-white/5 px-3 py-2 rounded-xl border border-white/5">
                      <div className="w-2 h-2 rounded-full bg-indigo-400"></div>
                      <span>2. Çeldiricilerin pedagojik gücü</span>
                    </div>
                    <div className="flex items-center gap-2 bg-white/5 px-3 py-2 rounded-xl border border-white/5">
                      <div className="w-2 h-2 rounded-full bg-purple-400"></div>
                      <span>3. Skor & gerekçe üretimi</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STAGE 2: ÖĞRETMEN İNCELEME & DEĞERLENDİRME KRİTERİ FORMU */}
          {session.status === 'selection_review' && (
            <div className="bg-white rounded-3xl p-5 sm:p-6 shadow-sm border border-slate-200 space-y-5">
              {/* Header with status and Finalize Button */}
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-indigo-600" />
                    <h3 className="text-lg font-bold text-slate-900">
                      Öğretmen Gözden Geçirme & Gemini Değerlendirme Paneli
                    </h3>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    Soruları aşağıdaki puan ve gerekçelere göre inceleyiniz. İsterseniz ek kriterler belirterek tekrar değerlendirme isteyebilir,
                    puan eşiğini değiştirebilir veya soruları tek tek işaretleyebilirsiniz.
                  </p>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  {session.isEvaluationFinalized ? (
                    <span className="px-3.5 py-2 bg-emerald-100 text-emerald-800 font-bold text-xs rounded-xl flex items-center gap-1.5 border border-emerald-200 shadow-xs">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      Değerlendirme Onaylandı & Google Sheet'e İşlendi
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={handleFinalizeEvaluationAndSyncSheet}
                      disabled={isFinalizingEvaluation}
                      className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-bold text-xs rounded-xl shadow-md transition-all cursor-pointer disabled:opacity-50"
                    >
                      <Check className="w-4 h-4" />
                      <span>{isFinalizingEvaluation ? 'İşleniyor...' : 'Değerlendirmeyi Tamamla ve Google Sheet’e İşle'}</span>
                    </button>
                  )}
                </div>
              </div>

              {/* KONU BAZLI EŞİK VE SORU SEÇİM AYARLARI */}
              <div className="bg-slate-50 p-4 sm:p-5 rounded-2xl border border-slate-200/90 space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/60 pb-3">
                  <div className="flex items-center gap-2">
                    <Sliders className="w-5 h-5 text-indigo-600" />
                    <div>
                      <h4 className="text-sm font-bold text-slate-900">
                        Konu Bazlı Eşik ve Soru Seçim Kriterleri
                      </h4>
                      <p className="text-xs text-slate-500">
                        Her konu için bağımsız olarak Analiz Skoru Eşiği (%) veya En Yüksek Skorlu Soru Adedi (Top N) belirleyebilirsiniz.
                      </p>
                    </div>
                  </div>

                  {/* Summary badge */}
                  <span className="px-3 py-1.5 bg-indigo-100 text-indigo-900 text-xs font-bold rounded-xl border border-indigo-200 shadow-2xs">
                    Toplam {selectedQuestionsForQuiz.length} / {session.questions.length} Soru Seçildi
                  </span>
                </div>

                {/* Per-Topic Cards Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {questionsByTopic.map((item) => {
                    const topicCfg = item.config;
                    const isTopicUpdating = updatingTopic === item.topic;

                    return (
                      <div
                        key={item.topic}
                        className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-2xs hover:border-indigo-300 transition-all space-y-3.5"
                      >
                        {/* Topic Header & Stats */}
                        <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-2.5">
                          <div className="flex items-center gap-2">
                            <BookOpen className="w-4 h-4 text-indigo-600 shrink-0" />
                            <h5 className="text-sm font-bold text-slate-900 leading-snug">{item.topic}</h5>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className="px-2 py-0.5 bg-blue-50 text-blue-700 text-[11px] font-semibold rounded-md border border-blue-100">
                              {item.totalCount} Soru Eklendi
                            </span>
                            <span
                              className={`px-2 py-0.5 text-[11px] font-bold rounded-md border ${
                                item.selectedCount > 0
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                  : 'bg-slate-100 text-slate-600 border-slate-200'
                              }`}
                            >
                              ✓ {item.selectedCount} Seçildi
                            </span>
                          </div>
                        </div>

                        {/* Mode Switcher Tabs */}
                        <div className="inline-flex w-full p-1 bg-slate-100 rounded-xl text-xs font-semibold">
                          <button
                            type="button"
                            onClick={() =>
                              handleUpdateTopicConfig(item.topic, {
                                selectionMode: 'threshold_and_top_count',
                              })
                            }
                            className={`flex-1 py-1.5 rounded-lg text-center transition-colors cursor-pointer text-[11px] ${
                              topicCfg.selectionMode === 'threshold_and_top_count'
                                ? 'bg-white text-indigo-700 shadow-xs font-bold'
                                : 'text-slate-600 hover:text-slate-900'
                            }`}
                          >
                            🎯 Eşik + En İyi N
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              handleUpdateTopicConfig(item.topic, { selectionMode: 'threshold' })
                            }
                            className={`flex-1 py-1.5 rounded-lg text-center transition-colors cursor-pointer text-[11px] ${
                              topicCfg.selectionMode === 'threshold'
                                ? 'bg-white text-indigo-700 shadow-xs font-bold'
                                : 'text-slate-600 hover:text-slate-900'
                            }`}
                          >
                            📊 Yalnızca Eşik
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              handleUpdateTopicConfig(item.topic, { selectionMode: 'top_count' })
                            }
                            className={`flex-1 py-1.5 rounded-lg text-center transition-colors cursor-pointer text-[11px] ${
                              topicCfg.selectionMode === 'top_count'
                                ? 'bg-white text-indigo-700 shadow-xs font-bold'
                                : 'text-slate-600 hover:text-slate-900'
                            }`}
                          >
                            🏆 Yalnızca Top N
                          </button>
                        </div>

                        {/* Configuration Controls based on mode */}
                        <div className="space-y-3 pt-1">
                          {/* Eşik Ayarı Bölümü */}
                          {(topicCfg.selectionMode === 'threshold' ||
                            topicCfg.selectionMode === 'threshold_and_top_count') && (
                            <div className="space-y-1.5 bg-slate-50/80 p-2.5 rounded-xl border border-slate-200/80">
                              <div className="flex items-center justify-between text-xs">
                                <span className="text-slate-700 font-semibold">
                                  Puan Eşiği:
                                </span>
                                <span className="font-mono font-bold text-indigo-700 bg-white border border-indigo-200 px-2 py-0.5 rounded-md">
                                  %{topicCfg.scoreThreshold}
                                </span>
                              </div>

                              <div className="flex items-center gap-3">
                                <input
                                  type="range"
                                  min="0"
                                  max="100"
                                  step="5"
                                  value={topicCfg.scoreThreshold}
                                  onChange={(e) =>
                                    handleUpdateTopicConfig(item.topic, {
                                      scoreThreshold: Number(e.target.value),
                                    })
                                  }
                                  className="w-full accent-indigo-600 cursor-pointer"
                                />
                              </div>
                            </div>
                          )}

                          {/* En İyi N Soru Ayarı Bölümü */}
                          {(topicCfg.selectionMode === 'top_count' ||
                            topicCfg.selectionMode === 'threshold_and_top_count') && (
                            <div className="space-y-1.5 bg-slate-50/80 p-2.5 rounded-xl border border-slate-200/80">
                              <div className="flex items-center justify-between text-xs">
                                <span className="text-slate-700 font-semibold">
                                  En İyi Soru Adedi (Top N):
                                </span>
                                <span className="font-mono font-bold text-indigo-700 bg-white border border-indigo-200 px-2 py-0.5 rounded-md">
                                  {topicCfg.topCount} Soru
                                </span>
                              </div>

                              <div className="flex items-center gap-2 flex-wrap">
                                <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl px-2 py-0.5 shadow-2xs">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleUpdateTopicConfig(item.topic, {
                                        topCount: Math.max(1, topicCfg.topCount - 1),
                                      })
                                    }
                                    className="w-6 h-6 flex items-center justify-center font-bold text-slate-600 hover:bg-slate-100 rounded-md cursor-pointer"
                                    title="1 Azalt"
                                  >
                                    -
                                  </button>
                                  <span className="w-8 text-center text-xs font-black text-indigo-700 font-mono">
                                    {topicCfg.topCount}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleUpdateTopicConfig(item.topic, {
                                        topCount: Math.min(
                                          Math.max(1, item.totalCount),
                                          topicCfg.topCount + 1
                                        ),
                                      })
                                    }
                                    className="w-6 h-6 flex items-center justify-center font-bold text-slate-600 hover:bg-slate-100 rounded-md cursor-pointer"
                                    title="1 Artır"
                                  >
                                    +
                                  </button>
                                </div>

                                {/* Presets */}
                                {[1, 2, 3, 5].map((preset) => (
                                  <button
                                    key={preset}
                                    type="button"
                                    onClick={() =>
                                      handleUpdateTopicConfig(item.topic, { topCount: preset })
                                    }
                                    className={`px-2.5 py-1 text-xs font-semibold rounded-lg border transition-colors cursor-pointer ${
                                      topicCfg.topCount === preset
                                        ? 'bg-indigo-600 text-white border-indigo-600 font-bold'
                                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                                    }`}
                                  >
                                    Top {preset}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Konu Başına Soru Sorma Sınırı (Öğrenci Başına) */}
                          <div className="space-y-1.5 bg-emerald-50/70 p-2.5 rounded-xl border border-emerald-200/80">
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-emerald-950 font-semibold">
                                Öğrenci Başına Soru Sınırı (Bu Konu):
                              </span>
                              <span className="font-mono font-bold text-emerald-800 bg-white border border-emerald-300 px-2 py-0.5 rounded-md">
                                {topicCfg.maxQuestionsLimit ?? session.maxQuestionsPerTopicPerStudent ?? 1} Soru
                              </span>
                            </div>

                            <div className="flex items-center gap-2 flex-wrap">
                              <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl px-2 py-0.5 shadow-2xs">
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleUpdateTopicConfig(item.topic, {
                                      maxQuestionsLimit: Math.max(
                                        1,
                                        (topicCfg.maxQuestionsLimit ?? session.maxQuestionsPerTopicPerStudent ?? 1) - 1
                                      ),
                                    })
                                  }
                                  className="w-6 h-6 flex items-center justify-center font-bold text-slate-600 hover:bg-slate-100 rounded-md cursor-pointer"
                                  title="1 Azalt"
                                >
                                  -
                                </button>
                                <span className="w-8 text-center text-xs font-black text-emerald-700 font-mono">
                                  {topicCfg.maxQuestionsLimit ?? session.maxQuestionsPerTopicPerStudent ?? 1}
                                </span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleUpdateTopicConfig(item.topic, {
                                      maxQuestionsLimit: Math.min(
                                        10,
                                        (topicCfg.maxQuestionsLimit ?? session.maxQuestionsPerTopicPerStudent ?? 1) + 1
                                      ),
                                    })
                                  }
                                  className="w-6 h-6 flex items-center justify-center font-bold text-slate-600 hover:bg-slate-100 rounded-md cursor-pointer"
                                  title="1 Artır"
                                >
                                  +
                                </button>
                              </div>

                              {[1, 2, 3].map((preset) => (
                                <button
                                  key={preset}
                                  type="button"
                                  onClick={() =>
                                    handleUpdateTopicConfig(item.topic, {
                                      maxQuestionsLimit: preset,
                                    })
                                  }
                                  className={`px-2 py-0.5 text-xs font-semibold rounded-lg border transition-colors cursor-pointer ${
                                    (topicCfg.maxQuestionsLimit ?? session.maxQuestionsPerTopicPerStudent ?? 1) === preset
                                      ? 'bg-emerald-600 text-white border-emerald-600 font-bold'
                                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                                  }`}
                                >
                                  {preset} Soru
                                </button>
                              ))}
                            </div>
                            <p className="text-[10px] text-emerald-800">
                              Öğrenciler bu konuya en fazla {topicCfg.maxQuestionsLimit ?? session.maxQuestionsPerTopicPerStudent ?? 1} soru ekleyebilir.
                            </p>
                          </div>

                          <p className="text-[11px] text-slate-500">
                            {topicCfg.selectionMode === 'threshold_and_top_count'
                              ? `Bu konudan %${topicCfg.scoreThreshold} eşiğini geçenler arasından en yüksek puanlı ilk ${topicCfg.topCount} soru (${item.selectedCount} soru) seçilmektedir.`
                              : topicCfg.selectionMode === 'threshold'
                              ? `Bu konudan %${topicCfg.scoreThreshold} ve üzeri puan alan ${item.selectedCount} soru seçilmektedir.`
                              : `Bu konudan en yüksek puanı alan ilk ${topicCfg.topCount} soru seçilmektedir.`}
                          </p>
                        </div>

                        {isTopicUpdating && (
                          <div className="text-[11px] text-indigo-600 flex items-center gap-1 font-medium">
                            <RefreshCw className="w-3 h-3 animate-spin" />
                            <span>Kriter güncelleniyor...</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Hızlı Toplu Ayar Çubuğu */}
                <div className="bg-white p-3.5 sm:p-4 rounded-xl border border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-800">⚡ Hızlı Toplu Kural Uygula:</span>
                    <span className="text-slate-500">Tüm konulara tek tıkla toplu kriter yansıtın.</span>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-lg p-1">
                      <button
                        type="button"
                        onClick={() => setBulkMode('threshold_and_top_count')}
                        className={`px-2.5 py-1 rounded-md font-semibold cursor-pointer ${
                          bulkMode === 'threshold_and_top_count'
                            ? 'bg-indigo-600 text-white shadow-2xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        🎯 Eşik + En İyi N
                      </button>
                      <button
                        type="button"
                        onClick={() => setBulkMode('threshold')}
                        className={`px-2.5 py-1 rounded-md font-semibold cursor-pointer ${
                          bulkMode === 'threshold'
                            ? 'bg-indigo-600 text-white shadow-2xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        📊 Yalnızca Eşik
                      </button>
                      <button
                        type="button"
                        onClick={() => setBulkMode('top_count')}
                        className={`px-2.5 py-1 rounded-md font-semibold cursor-pointer ${
                          bulkMode === 'top_count'
                            ? 'bg-indigo-600 text-white shadow-2xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        🏆 Yalnızca Top N
                      </button>
                    </div>

                    {(bulkMode === 'threshold' || bulkMode === 'threshold_and_top_count') && (
                      <div className="flex items-center gap-1">
                        <span className="text-slate-500 font-medium">Eşik:</span>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step={5}
                          value={bulkThreshold}
                          onChange={(e) => setBulkThreshold(Number(e.target.value) || 70)}
                          className="w-14 px-2 py-1 text-center font-bold font-mono bg-slate-50 border border-slate-200 rounded-lg text-indigo-700 outline-hidden"
                          title="Puan Eşiği"
                        />
                        <span className="text-slate-500">%</span>
                      </div>
                    )}

                    {(bulkMode === 'top_count' || bulkMode === 'threshold_and_top_count') && (
                      <div className="flex items-center gap-1">
                        <span className="text-slate-500 font-medium">Top N:</span>
                        <input
                          type="number"
                          min={1}
                          max={20}
                          step={1}
                          value={bulkTopCount}
                          onChange={(e) => setBulkTopCount(Number(e.target.value) || 2)}
                          className="w-14 px-2 py-1 text-center font-bold font-mono bg-slate-50 border border-slate-200 rounded-lg text-indigo-700 outline-hidden"
                          title="Seçilecek Soru Adedi"
                        />
                        <span className="text-slate-500">Soru</span>
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => handleApplyAllTopicsRule(bulkMode, bulkThreshold, bulkTopCount)}
                      className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-bold rounded-lg shadow-2xs transition-colors cursor-pointer"
                    >
                      Tüm Konulara Uygula
                    </button>
                  </div>
                </div>
              </div>

              {/* EK DEĞERLENDİRME KRİTERİ VE YENİDEN İNCELEME İSTEĞİ FORMU */}
              <div className="p-4 sm:p-5 rounded-2xl bg-indigo-50/50 border border-indigo-100 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-indigo-950 uppercase tracking-wider flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-indigo-600" />
                    <span>Ek Değerlendirme Kriteri / Özel Prompt Girişi (İsteğe Bağlı)</span>
                  </label>
                  <span className="text-[11px] text-indigo-600 font-medium">
                    Gemini'nin puanlama kriterlerini yönlendirebilirsiniz
                  </span>
                </div>

                <textarea
                  rows={3}
                  value={additionalPromptInput}
                  onChange={(e) => setAdditionalPromptInput(e.target.value)}
                  placeholder="Örn: Çeldiricilerin mantıksal dengesine ve çelişkisizliğine daha fazla ağırlık ver. Yalnızca kuru tanım soran soruların puanını düşür; formül uygulama, analiz ve kavrama düzeyindeki soruları ödüllendir."
                  className="w-full p-3 bg-white border border-indigo-200 rounded-xl text-xs sm:text-sm text-slate-800 placeholder:text-slate-400 focus:outline-hidden focus:border-indigo-600 transition-all font-sans"
                />

                {/* Quick Prompt Chips */}
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <span className="text-[11px] font-semibold text-slate-500 mr-1">Örnek Kriterler:</span>
                  {[
                    'Çeldiricilerin zorluk ve dengesine daha yüksek ağırlık ver',
                    'Kavrama ve analiz düzeyindeki soruları ödüllendir',
                    'Kısa ve ezbere dayalı soruların puanını kır',
                    'Terminoloji ve bilimsel doğruluğu çok katı denetle',
                  ].map((chip, chipIdx) => (
                    <button
                      key={chipIdx}
                      type="button"
                      onClick={() => {
                        setAdditionalPromptInput((prev) =>
                          prev ? `${prev}\n• ${chip}` : chip
                        );
                      }}
                      className="px-2.5 py-1 bg-white hover:bg-indigo-100 text-indigo-800 border border-indigo-200 rounded-lg text-[11px] font-medium transition-colors cursor-pointer"
                    >
                      + {chip}
                    </button>
                  ))}
                </div>

                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => handleRunGeminiAnalysis(additionalPromptInput)}
                    disabled={isAnalyzingWithGemini}
                    className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isAnalyzingWithGemini ? 'animate-spin' : ''}`} />
                    <span>
                      {isAnalyzingWithGemini
                        ? 'Gemini Yeniden İnceliyor...'
                        : 'Ek Kriterlerle Yeniden Değerlendir'}
                    </span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* QUESTIONS LIST WITH TOPIC GROUPING & SELECTION FILTERS */}
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                  <Layers className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Oturumdaki Sorular ({filteredQuestions.length} / {session.questions.length})
                  </h3>
                  <p className="text-xs text-slate-500">
                    Eklenen ve seçilen sorular konu başlıklarına göre gruplandırılmıştır.
                  </p>
                </div>
              </div>

              {/* View Mode Toggle & Status Filter Buttons */}
              <div className="flex items-center gap-3 flex-wrap">
                {/* View Mode Switcher */}
                <div className="inline-flex p-1 bg-slate-100 rounded-xl text-xs font-semibold">
                  <button
                    type="button"
                    onClick={() => setQuestionsViewMode('grouped')}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                      questionsViewMode === 'grouped'
                        ? 'bg-white text-indigo-700 shadow-xs font-bold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Layers className="w-3.5 h-3.5" />
                    <span>Konu Bazlı Gruplama</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setQuestionsViewMode('list')}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                      questionsViewMode === 'list'
                        ? 'bg-white text-indigo-700 shadow-xs font-bold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <ListFilter className="w-3.5 h-3.5" />
                    <span>Düz Liste</span>
                  </button>
                </div>

                {/* Filter Buttons */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    onClick={() => setSelectedTopicFilter('all')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                      selectedTopicFilter === 'all'
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                    }`}
                  >
                    Tümü ({session.questions.length})
                  </button>
                  <button
                    onClick={() => setSelectedTopicFilter('selected')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                      selectedTopicFilter === 'selected'
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800'
                    }`}
                  >
                    ✓ Seçilenler ({selectedQuestionsForQuiz.length})
                  </button>
                  <button
                    onClick={() => setSelectedTopicFilter('unselected')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                      selectedTopicFilter === 'unselected'
                        ? 'bg-slate-700 text-white shadow-xs'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                    }`}
                  >
                    Seçilmeyenler ({session.questions.length - selectedQuestionsForQuiz.length})
                  </button>

                  {questionsViewMode === 'list' &&
                    topicsList.map((t, idx) => (
                      <button
                        key={idx}
                        onClick={() => setSelectedTopicFilter(t)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors cursor-pointer ${
                          selectedTopicFilter === t
                            ? 'bg-indigo-600 text-white shadow-xs'
                            : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                </div>
              </div>
            </div>

            {/* KONU BAZLI GRUPLANDIRILMIŞ GÖRÜNÜM (DEFAULT & REQUESTED) */}
            {questionsViewMode === 'grouped' ? (
              <div className="space-y-6">
                {questionsByTopic.length === 0 ? (
                  <div className="text-center py-12 text-slate-400 space-y-2">
                    <Users className="w-12 h-12 mx-auto text-slate-300" />
                    <p className="text-sm font-medium">Henüz soru eklenmedi.</p>
                  </div>
                ) : (
                  questionsByTopic.map((tGroup) => {
                    const isCollapsed = !!collapsedTopics[tGroup.topic];
                    const cfg = tGroup.config;

                    return (
                      <div
                        key={tGroup.topic}
                        className="rounded-2xl border-2 border-slate-200 overflow-hidden bg-slate-50/50 shadow-2xs transition-all"
                      >
                        {/* Topic Group Header */}
                        <div
                          onClick={() => toggleTopicCollapse(tGroup.topic)}
                          className="p-4 bg-white border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 cursor-pointer hover:bg-slate-50/80 transition-colors select-none"
                        >
                          <div className="flex items-center gap-2.5">
                            <button
                              type="button"
                              className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 transition-colors cursor-pointer"
                            >
                              {isCollapsed ? (
                                <ChevronRight className="w-4 h-4" />
                              ) : (
                                <ChevronDown className="w-4 h-4" />
                              )}
                            </button>
                            <BookOpen className="w-5 h-5 text-indigo-600" />
                            <div>
                              <h4 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                                {tGroup.topic}
                              </h4>
                            </div>
                          </div>

                          {/* Topic Group Badges */}
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="px-2.5 py-1 bg-blue-50 text-blue-800 text-xs font-bold rounded-lg border border-blue-200">
                              Toplam {tGroup.totalCount} Soru Eklendi
                            </span>
                            <span
                              className={`px-2.5 py-1 text-xs font-bold rounded-lg border ${
                                tGroup.selectedCount > 0
                                  ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                                  : 'bg-slate-100 text-slate-600 border-slate-200'
                              }`}
                            >
                              ✓ {tGroup.selectedCount} Soru Seçildi
                            </span>
                            <span className="px-2.5 py-1 bg-indigo-50 text-indigo-700 text-xs font-semibold rounded-lg border border-indigo-100">
                              {cfg.selectionMode === 'threshold'
                                ? `🎯 Eşik: %${cfg.scoreThreshold}`
                                : `🏆 Top ${cfg.topCount} Soru`}
                            </span>
                          </div>
                        </div>

                        {/* Topic Group Content */}
                        {!isCollapsed && (
                          <div className="p-4 sm:p-5">
                            {tGroup.questions.length === 0 ? (
                              <div className="py-6 text-center text-slate-400 text-xs font-medium">
                                Bu konuya henüz soru eklenmedi veya seçili filtreye ({selectedTopicFilter}) uygun soru bulunamadı.
                              </div>
                            ) : (
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {tGroup.questions.map((q) => {
                                  const isSelected = q.selectionStatus === 'Seçildi';
                                  const topicThreshold = cfg.scoreThreshold;

                                  return (
                                    <div
                                      key={q.id}
                                      className={`p-5 rounded-2xl border-2 transition-all space-y-3.5 ${
                                        isSelected
                                          ? 'border-emerald-200 bg-emerald-50/20 shadow-xs'
                                          : 'border-slate-200 bg-white hover:border-slate-300'
                                      }`}
                                    >
                                      {/* Card Header: Topic & Selection Badge */}
                                      <div className="flex items-start justify-between gap-2">
                                        <div>
                                          <span className="px-2.5 py-0.5 bg-indigo-50 text-indigo-700 font-semibold text-xs rounded-md">
                                            {q.topic}
                                          </span>
                                          <span className="text-xs text-slate-400 ml-2">
                                            Öğrenci: <strong className="text-slate-600">{q.studentNo}</strong>
                                            {q.studentName ? ` (${q.studentName})` : ''}
                                          </span>
                                        </div>

                                        {/* Status badge & toggle */}
                                        <div className="flex items-center gap-1.5">
                                          {q.analysisScore > 0 && (
                                            <span
                                              className={`px-2 py-0.5 text-xs font-bold rounded-md ${
                                                q.analysisScore >= topicThreshold
                                                  ? 'bg-emerald-100 text-emerald-800'
                                                  : 'bg-amber-100 text-amber-800'
                                              }`}
                                            >
                                              Skor: {q.analysisScore}
                                            </span>
                                          )}

                                          <button
                                            type="button"
                                            onClick={() => handleToggleSelection(q.id, q.selectionStatus)}
                                            className={`px-2.5 py-0.5 text-xs font-bold rounded-lg border transition-colors cursor-pointer ${
                                              isSelected
                                                ? 'bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700 shadow-2xs'
                                                : 'bg-slate-100 text-slate-600 border-slate-300 hover:bg-slate-200'
                                            }`}
                                            title="Tıklayarak durumu değiştir"
                                          >
                                            {isSelected ? '✓ Seçildi' : 'Seçilmedi'}
                                          </button>
                                        </div>
                                      </div>

                                      {/* Question Stem */}
                                      <p className="text-sm font-semibold text-slate-900 leading-snug">
                                        {q.question}
                                      </p>

                                      {/* 5 Options A, B, C, D, E */}
                                      <div className="space-y-1.5 text-xs text-slate-700 bg-slate-50/80 p-3 rounded-xl border border-slate-100 font-mono">
                                        {[
                                          { opt: 'A', text: q.optionA },
                                          { opt: 'B', text: q.optionB },
                                          { opt: 'C', text: q.optionC },
                                          { opt: 'D', text: q.optionD },
                                          { opt: 'E', text: q.optionE },
                                        ].map(({ opt, text }) => (
                                          <div
                                            key={opt}
                                            className={`flex items-start gap-1.5 ${
                                              q.answer === opt
                                                ? 'text-emerald-700 font-bold bg-emerald-100/60 px-1.5 py-0.5 rounded-sm'
                                                : ''
                                            }`}
                                          >
                                            <span className="w-4 font-bold">{opt})</span>
                                            <span className="font-sans leading-tight">{text}</span>
                                            {q.answer === opt && (
                                              <span className="ml-auto text-emerald-600 text-[10px] font-sans font-bold">
                                                (Doğru Cevap)
                                              </span>
                                            )}
                                          </div>
                                        ))}
                                      </div>

                                      {/* Gemini Feedback if available */}
                                      {q.analysisFeedback && (
                                        <div className="p-2.5 rounded-xl bg-indigo-50/60 border border-indigo-100 text-xs text-indigo-950">
                                          <span className="font-bold flex items-center gap-1 text-indigo-700 mb-0.5">
                                            <Sparkles className="w-3.5 h-3.5" />
                                            Gemini Değerlendirmesi:
                                          </span>
                                          <p className="text-slate-700 leading-relaxed">
                                            {q.analysisFeedback}
                                          </p>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            ) : (
              /* DÜZ LİSTE GÖRÜNÜMÜ */
              <div>
                {filteredQuestions.length === 0 ? (
                  <div className="text-center py-12 text-slate-400 space-y-2">
                    <Users className="w-12 h-12 mx-auto text-slate-300" />
                    <p className="text-sm font-medium">Bu filtrede soru bulunamadı.</p>
                    <p className="text-xs">
                      Öğrenciler <strong>{session.code}</strong> kodu ile soru yüklediğinde burada listelenecektir.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {filteredQuestions.map((q) => {
                      const isSelected = q.selectionStatus === 'Seçildi';
                      const topicThreshold =
                        session.topicConfigs?.[q.topic]?.scoreThreshold ?? session.scoreThreshold;

                      return (
                        <div
                          key={q.id}
                          className={`p-5 rounded-2xl border-2 transition-all space-y-3.5 ${
                            isSelected
                              ? 'border-emerald-200 bg-emerald-50/20'
                              : 'border-slate-200 bg-white hover:border-slate-300'
                          }`}
                        >
                          {/* Card Header: Topic & Selection Badge */}
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <span className="px-2.5 py-0.5 bg-indigo-50 text-indigo-700 font-semibold text-xs rounded-md">
                                {q.topic}
                              </span>
                              <span className="text-xs text-slate-400 ml-2">
                                Öğrenci: <strong className="text-slate-600">{q.studentNo}</strong>
                                {q.studentName ? ` (${q.studentName})` : ''}
                              </span>
                            </div>

                            {/* Status badge & toggle */}
                            <div className="flex items-center gap-1.5">
                              {q.analysisScore > 0 && (
                                <span
                                  className={`px-2 py-0.5 text-xs font-bold rounded-md ${
                                    q.analysisScore >= topicThreshold
                                      ? 'bg-emerald-100 text-emerald-800'
                                      : 'bg-amber-100 text-amber-800'
                                  }`}
                                >
                                  Skor: {q.analysisScore}
                                </span>
                              )}

                              <button
                                type="button"
                                onClick={() => handleToggleSelection(q.id, q.selectionStatus)}
                                className={`px-2.5 py-0.5 text-xs font-bold rounded-lg border transition-colors cursor-pointer ${
                                  isSelected
                                    ? 'bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700'
                                    : 'bg-slate-100 text-slate-600 border-slate-300 hover:bg-slate-200'
                                }`}
                                title="Tıklayarak durumu değiştir"
                              >
                                {isSelected ? '✓ Seçildi' : 'Seçilmedi'}
                              </button>
                            </div>
                          </div>

                          {/* Question Stem */}
                          <p className="text-sm font-semibold text-slate-900 leading-snug">{q.question}</p>

                          {/* 5 Options A, B, C, D, E */}
                          <div className="space-y-1.5 text-xs text-slate-700 bg-slate-50/80 p-3 rounded-xl border border-slate-100 font-mono">
                            {[
                              { opt: 'A', text: q.optionA },
                              { opt: 'B', text: q.optionB },
                              { opt: 'C', text: q.optionC },
                              { opt: 'D', text: q.optionD },
                              { opt: 'E', text: q.optionE },
                            ].map(({ opt, text }) => (
                              <div
                                key={opt}
                                className={`flex items-start gap-1.5 ${
                                  q.answer === opt ? 'text-emerald-700 font-bold bg-emerald-100/60 px-1.5 py-0.5 rounded-sm' : ''
                                }`}
                              >
                                <span className="w-4 font-bold">{opt})</span>
                                <span className="font-sans leading-tight">{text}</span>
                                {q.answer === opt && (
                                  <span className="ml-auto text-emerald-600 text-[10px] font-sans font-bold">
                                    (Doğru Cevap)
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>

                          {/* Gemini Feedback if available */}
                          {q.analysisFeedback && (
                            <div className="p-2.5 rounded-xl bg-indigo-50/60 border border-indigo-100 text-xs text-indigo-950">
                              <span className="font-bold flex items-center gap-1 text-indigo-700 mb-0.5">
                                <Sparkles className="w-3.5 h-3.5" />
                                Gemini Değerlendirmesi:
                              </span>
                              <p className="text-slate-700 leading-relaxed">{q.analysisFeedback}</p>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* STAGE 3: CANLI QUIZ GÖZLEM EKRANI (LIVE QUIZ OBSERVER) */}
      {session && session.status === 'quiz_active' && currentQuizQ && (
        <div className="space-y-6 animate-in fade-in duration-150">
          {/* Quiz Top Control Bar */}
          <div className="bg-white rounded-3xl p-5 sm:p-6 shadow-sm border border-slate-200 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="px-3.5 py-1.5 bg-indigo-600 text-white text-sm font-extrabold rounded-xl shadow-xs">
                Soru {session.quizState.activeQuestionIndex + 1} / {selectedQuestionsForQuiz.length}
              </span>
              <div>
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
                  Konu: {currentQuizQ.topic}
                </span>
                <span className="text-xs text-slate-400">
                  Soru Sahibi Öğrenci: <strong className="text-slate-600">{currentQuizQ.studentNo}</strong>
                </span>
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1 bg-amber-50 border border-amber-200 text-amber-900 text-xs font-bold rounded-xl shadow-xs">
                <span>Cevap Hakkı:</span>
                <div className="flex items-center gap-1 bg-white border border-amber-300 rounded-lg px-1.5 py-0.5">
                  <button
                    type="button"
                    onClick={() => handleUpdateLimitInstant('attempts', Math.max(1, (session.maxAnswerAttemptsPerQuestion || 1) - 1))}
                    className="w-4 h-4 flex items-center justify-center font-bold text-slate-600 hover:bg-slate-100 rounded cursor-pointer"
                    title="Cevap Hakkını Azalt"
                  >
                    -
                  </button>
                  <span className="font-mono text-indigo-700 px-1 font-bold">
                    {session.maxAnswerAttemptsPerQuestion || 1}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleUpdateLimitInstant('attempts', Math.min(10, (session.maxAnswerAttemptsPerQuestion || 1) + 1))}
                    className="w-4 h-4 flex items-center justify-center font-bold text-slate-600 hover:bg-slate-100 rounded cursor-pointer"
                    title="Cevap Hakkını Artır (Öğrenci ekranlarına anında iletilir)"
                  >
                    +
                  </button>
                </div>
                <span>Hak</span>
              </div>
            </div>

            {/* Controls */}
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => handleQuizControl('toggle_accepting')}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-xl transition-colors cursor-pointer ${
                  session.quizState.isAcceptingAnswers
                    ? 'bg-amber-100 text-amber-800 hover:bg-amber-200'
                    : 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                }`}
              >
                {session.quizState.isAcceptingAnswers ? (
                  <>
                    <Lock className="w-3.5 h-3.5" />
                    <span>Cevap Alımını Durdur</span>
                  </>
                ) : (
                  <>
                    <Unlock className="w-3.5 h-3.5" />
                    <span>Cevap Alımını Aç</span>
                  </>
                )}
              </button>

              <button
                onClick={() => handleQuizControl('toggle_answer')}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-xl transition-colors cursor-pointer"
              >
                {session.quizState.showAnswer ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                <span>{session.quizState.showAnswer ? 'Cevabı Gizle' : 'Doğru Cevabı Göster'}</span>
              </button>

              <button
                onClick={() => handleQuizControl('prev')}
                disabled={session.quizState.activeQuestionIndex === 0}
                className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl disabled:opacity-40 cursor-pointer"
                title="Önceki Soru"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <button
                onClick={() => handleQuizControl('next')}
                disabled={session.quizState.activeQuestionIndex === selectedQuestionsForQuiz.length - 1}
                className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl disabled:opacity-40 cursor-pointer"
                title="Sonraki Soru"
              >
                <ChevronRight className="w-4 h-4" />
              </button>

              {session.answers.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowLiveReportModal(true)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 text-xs font-bold rounded-xl transition-colors cursor-pointer"
                  title="Quiz Analiz Raporunu İncele"
                >
                  <BarChart3 className="w-3.5 h-3.5 text-purple-600" />
                  <span>Canlı Analiz Raporu ({session.answers.length})</span>
                </button>
              )}

              <button
                onClick={() => handleQuizControl('finish')}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer"
              >
                Quizi Bitir
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left Column: Active Question Presentation */}
            <div className="lg:col-span-7 bg-white rounded-3xl p-6 sm:p-8 shadow-sm border border-slate-200 space-y-5">
              <div className="text-xl font-bold text-slate-900 leading-relaxed">
                {currentQuizQ.question}
              </div>

              {/* 5 Options list */}
              <div className="space-y-3 pt-2">
                {[
                  { key: 'A', text: currentQuizQ.optionA },
                  { key: 'B', text: currentQuizQ.optionB },
                  { key: 'C', text: currentQuizQ.optionC },
                  { key: 'D', text: currentQuizQ.optionD },
                  { key: 'E', text: currentQuizQ.optionE },
                ].map(({ key, text }) => {
                  const isCorrect = currentQuizQ.answer === key;
                  const isRevealed = session.quizState.showAnswer;
                  const count = liveQuizStats[key as keyof typeof liveQuizStats] || 0;
                  const pct =
                    liveQuizStats.total > 0 ? Math.round((count / liveQuizStats.total) * 100) : 0;

                  return (
                    <div
                      key={key}
                      className={`p-4 rounded-2xl border-2 transition-all flex items-start justify-between gap-3 ${
                        isRevealed && isCorrect
                          ? 'border-emerald-500 bg-emerald-50/60 ring-2 ring-emerald-500/20'
                          : 'border-slate-200 bg-slate-50/50'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <span
                          className={`w-8 h-8 rounded-xl font-bold text-sm flex items-center justify-center shrink-0 ${
                            isRevealed && isCorrect
                              ? 'bg-emerald-600 text-white'
                              : 'bg-white border border-slate-300 text-slate-700'
                          }`}
                        >
                          {key}
                        </span>
                        <span className="text-sm font-medium text-slate-900 pt-1 leading-snug">
                          {text}
                        </span>
                      </div>

                      {/* Vote Count & Bar */}
                      <div className="text-right shrink-0">
                        <span className="text-xs font-bold text-slate-700">
                          {count} ({pct}%)
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {session.quizState.showAnswer && (
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-xs text-emerald-950 space-y-1">
                  <div className="font-bold flex items-center gap-1.5 text-emerald-800 text-sm">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>Doğru Seçenek: {currentQuizQ.answer}</span>
                  </div>
                  {currentQuizQ.analysisFeedback && (
                    <p className="text-slate-600 pt-1">
                      Ölçülen Bilişsel Düzey / Gerekçe: {currentQuizQ.analysisFeedback}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Right Column: Real-Time Answer Observation & Distribution Chart */}
            <div className="lg:col-span-5 space-y-6">
              {/* Distribution Chart Card */}
              <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2">
                    <BarChart3 className="w-5 h-5 text-indigo-600" />
                    <h4 className="text-sm font-bold text-slate-900">Gerçek Zamanlı Cevap Dağılımı</h4>
                  </div>
                  <span className="text-xs font-bold px-2.5 py-1 bg-indigo-50 text-indigo-700 rounded-lg">
                    {liveQuizStats.total} Öğrenci Cevapladı
                  </span>
                </div>

                {/* Animated Horizontal Bars */}
                <div className="space-y-3 pt-1">
                  {(['A', 'B', 'C', 'D', 'E'] as const).map((opt) => {
                    const count = liveQuizStats[opt] || 0;
                    const pct =
                      liveQuizStats.total > 0 ? Math.round((count / liveQuizStats.total) * 100) : 0;
                    const isCorrect = currentQuizQ.answer === opt;
                    const isRevealed = session.quizState.showAnswer;

                    return (
                      <div key={opt} className="space-y-1">
                        <div className="flex items-center justify-between text-xs font-semibold">
                          <span className={isRevealed && isCorrect ? 'text-emerald-700 font-bold' : 'text-slate-700'}>
                            {opt} Seçeneği {isRevealed && isCorrect && '✓'}
                          </span>
                          <span className="text-slate-500 font-mono">
                            {count} kişi ({pct}%)
                          </span>
                        </div>
                        <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${
                              isRevealed && isCorrect ? 'bg-emerald-500' : 'bg-indigo-600'
                            }`}
                            style={{ width: `${pct}%` }}
                          ></div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Live Submissions Feed */}
              <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200 space-y-3 max-h-96 overflow-y-auto">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <h4 className="text-sm font-bold text-slate-900">Gelen Cevaplar Listesi</h4>
                  <span className="text-[11px] text-slate-400">Canlı akış</span>
                </div>

                {session.answers.filter((a) => a.questionId === currentQuizQ.id).length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-6">
                    Henüz cevap gelmedi. Öğrenciler işaretledikçe burada listelenecektir.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {session.answers
                      .filter((a) => a.questionId === currentQuizQ.id)
                      .slice()
                      .reverse()
                      .map((ans) => (
                        <div
                          key={ans.id}
                          className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-100 text-xs"
                        >
                          <div>
                            <span className="font-bold text-slate-800">{ans.studentNo}</span>
                            {ans.studentName && <span className="text-slate-500 ml-1">({ans.studentName})</span>}
                            <span className="text-slate-400 text-[10px] ml-2">{ans.timestamp}</span>
                          </div>

                          <div className="flex items-center gap-2">
                            <span className="w-6 h-6 rounded-md font-bold text-xs bg-indigo-100 text-indigo-700 flex items-center justify-center">
                              {ans.givenAnswer}
                            </span>
                            {session.quizState.showAnswer && (
                              <span
                                className={`px-2 py-0.5 rounded-md font-bold text-[10px] ${
                                  ans.isCorrect
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : 'bg-rose-100 text-rose-800'
                                }`}
                              >
                                {ans.isCorrect ? 'Doğru' : 'Yanlış'}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* STAGE 4: QUIZ FINISHED / RESULTS SUMMARY & COMPREHENSIVE ANALYSIS REPORT */}
      {session && session.status === 'finished' && (
        <QuizReportView
          session={session}
          onRefreshReport={handleGenerateQuizReport}
          isGeneratingReport={isGeneratingQuizReport}
          onSyncToSheet={handleSyncAnswersToSheet}
          isSyncingToSheet={isSyncingAnswers}
          onStartNewSession={() => setIsNewSessionModalOpen(true)}
        />
      )}

      {/* NEW SESSION MODAL */}
      {isNewSessionModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl border border-slate-100 space-y-5">
            <div className="border-b border-slate-100 pb-3">
              <h3 className="text-xl font-bold text-slate-900">Yeni Ders Oturumu Başlat</h3>
              <p className="text-xs text-slate-500 mt-1">
                Öğrencilerin soru yüklemesi için otomatik 5 haneli bir kod üretilecektir.
              </p>
            </div>

            <form onSubmit={handleCreateNewSession} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Ders Adı
                </label>
                <input
                  type="text"
                  required
                  value={newCourseName}
                  onChange={(e) => setNewCourseName(e.target.value)}
                  placeholder="Örn: Veri Yapıları ve Algoritmalar"
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:border-indigo-600 focus:bg-white outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Bugün Derste Anlatılan Konu Başlıkları (Her satıra bir konu)
                </label>
                <textarea
                  rows={4}
                  required
                  value={newTopicsInput}
                  onChange={(e) => setNewTopicsInput(e.target.value)}
                  placeholder={`İkili Arama Ağaçları (BST)
AVL Ağaçları
Hash Tabloları
Heap ve Öncelikli Kuyruk`}
                  className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm font-mono focus:border-indigo-600 focus:bg-white outline-hidden"
                />
                <span className="text-[11px] text-slate-400 mt-1 block">
                  Öğrenciler her konu başlığı için 5 seçenekli birer soru yükleyebilecektir.
                </span>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Gemini Analiz Skoru Eşiği (%{newThreshold})
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min="50"
                    max="95"
                    step="5"
                    value={newThreshold}
                    onChange={(e) => setNewThreshold(Number(e.target.value))}
                    className="w-full accent-indigo-600 cursor-pointer"
                  />
                  <span className="text-xs font-bold font-mono px-2.5 py-1 bg-indigo-50 text-indigo-700 rounded-md">
                    %{newThreshold}
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Soru Başına Cevap Verme Hakkı Sınırı (Varsayılan: 1)
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min="1"
                    max="10"
                    value={newAttemptsLimit}
                    onChange={(e) => setNewAttemptsLimit(Math.max(1, Number(e.target.value) || 1))}
                    className="w-20 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold font-mono text-center text-indigo-700 focus:bg-white focus:border-indigo-600 outline-hidden"
                  />
                  <span className="text-[11px] text-slate-500">
                    Öğrenci bu haktan fazla cevap vermeye çalışırsa uyarı verilir ve Google Sheet'e kaydedilmez.
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Öğrenci Başına Soru Giriş Sınırı (Varsayılan: 1)
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min="1"
                    max="20"
                    value={newQuestionsLimit}
                    onChange={(e) => setNewQuestionsLimit(Math.max(1, Number(e.target.value) || 1))}
                    className="w-20 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold font-mono text-center text-indigo-700 focus:bg-white focus:border-indigo-600 outline-hidden"
                  />
                  <span className="text-[11px] text-slate-500">
                    Öğrenciler form arayüzü ile tek tek toplamda en fazla bu sınır kadar soru yükleyebilir (Varsayılan: 1).
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Konu Başına Soru Sorma Sınırı (Varsayılan: 1)
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min="1"
                    max="10"
                    value={newTopicQuestionsLimit}
                    onChange={(e) => setNewTopicQuestionsLimit(Math.max(1, Number(e.target.value) || 1))}
                    className="w-20 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold font-mono text-center text-emerald-700 focus:bg-white focus:border-emerald-600 outline-hidden"
                  />
                  <span className="text-[11px] text-slate-500">
                    Öğrencilerin her konu başlığı için sorabileceği maksimum soru adedi (Varsayılan: her konudan 1 soru).
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Öğrencinin Soru Sorabileceği Maksimum Konu Sayısı (0: Sınırsız / Tümü)
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min="0"
                    max="20"
                    value={newMaxTopicsLimit}
                    onChange={(e) => setNewMaxTopicsLimit(Math.max(0, Number(e.target.value) || 0))}
                    className="w-20 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold font-mono text-center text-purple-700 focus:bg-white focus:border-purple-600 outline-hidden"
                  />
                  <span className="text-[11px] text-slate-500">
                    Öğrencilerin en fazla kaç farklı konuya soru gönderebileceğini sınırlar (0 = Tüm konulara soru sorabilir).
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsNewSessionModalOpen(false)}
                  className="px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  İptal
                </button>
                <button
                  type="submit"
                  disabled={isCreatingSession}
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-xs cursor-pointer disabled:opacity-50"
                >
                  {isCreatingSession ? 'Oluşturuluyor...' : 'Oturumu Başlat'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CONNECT EXISTING GOOGLE SHEET MODAL */}
      {isExistingSheetModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl border border-slate-100 space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="border-b border-slate-100 pb-3 flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-teal-100 text-teal-700 flex items-center justify-center">
                    <Link2 className="w-4 h-4" />
                  </div>
                  <h3 className="text-xl font-bold text-slate-900">Mevcut Google Sheet Bağla</h3>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Google Drive'ınızda var olan bir e-tabloyu oturum ile eşleştirebilirsiniz.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsExistingSheetModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 rounded-lg p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-3.5 bg-teal-50 border border-teal-200/80 text-teal-900 rounded-2xl text-xs space-y-1">
              <span className="font-bold flex items-center gap-1.5 text-teal-950">
                <CheckCircle2 className="w-4 h-4 text-teal-600" />
                Mevcut Veriler Silinmez (Üstüne Eklenir):
              </span>
              <p className="text-teal-800 leading-relaxed">
                Tabloda önceden kaydedilmiş olan sorular ve öğrenci cevapları korunur. Yeni sorular ve quiz cevapları listenin en altına (append) eklenerek devam eder.
              </p>
            </div>

            {existingSheetModalError && (
              <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-800 rounded-2xl text-xs font-medium flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{existingSheetModalError}</span>
              </div>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleConnectExistingSheet();
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Google Sheet Bağlantısı (URL) veya ID'si
                </label>
                <input
                  type="text"
                  required
                  value={existingSheetInput}
                  onChange={(e) => setExistingSheetInput(e.target.value)}
                  placeholder="https://docs.google.com/spreadsheets/d/1BxiMVs.../edit"
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:border-teal-600 focus:bg-white outline-hidden font-mono"
                />
                <span className="text-[11px] text-slate-400 mt-1 block">
                  Google Drive veya tarayıcı adres çubuğundaki e-tablo linkini buraya yapıştırabilirsiniz.
                </span>
              </div>

              {/* Recent Drive Sheets Picker (if available) */}
              {isLoadingDriveSheets ? (
                <div className="py-3 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Google Drive'daki e-tablolarınız taranıyor...</span>
                </div>
              ) : recentDriveSheets.length > 0 ? (
                <div className="space-y-2 pt-1 border-t border-slate-100">
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider">
                    Drive'daki Son E-Tablolarınız (Hızlı Seçim)
                  </label>
                  <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                    {recentDriveSheets.map((sh) => (
                      <button
                        key={sh.id}
                        type="button"
                        onClick={() => {
                          setExistingSheetInput(sh.id);
                          handleConnectExistingSheet(sh.id);
                        }}
                        disabled={isConnectingExistingSheet}
                        className="w-full text-left p-2.5 rounded-xl border border-slate-200 hover:border-teal-500 hover:bg-teal-50/40 text-xs transition-colors flex items-center justify-between gap-2 cursor-pointer disabled:opacity-50"
                      >
                        <div className="flex items-center gap-2 truncate">
                          <FileSpreadsheet className="w-4 h-4 text-emerald-600 shrink-0" />
                          <span className="font-semibold text-slate-800 truncate">{sh.name}</span>
                        </div>
                        <span className="text-[10px] text-slate-400 shrink-0 font-mono">
                          Seç & Bağla →
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsExistingSheetModalOpen(false)}
                  className="px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  İptal
                </button>
                <button
                  type="submit"
                  disabled={isConnectingExistingSheet || !existingSheetInput.trim()}
                  className="px-5 py-2.5 bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white text-xs font-bold rounded-xl shadow-xs cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                >
                  {isConnectingExistingSheet ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Bağlanıyor ve Doğrulanıyor...</span>
                    </>
                  ) : (
                    <>
                      <Link2 className="w-3.5 h-3.5" />
                      <span>Bu Tabloyu Oturuma Bağla</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* LIVE REPORT MODAL */}
      {showLiveReportModal && session && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto animate-in fade-in">
          <div className="bg-slate-50 rounded-3xl max-w-6xl w-full p-4 sm:p-6 shadow-2xl border border-slate-200 space-y-4 my-8 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3 px-2">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-indigo-600" />
                <h3 className="text-lg font-bold text-slate-900">Quiz Canlı Analiz Raporu</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowLiveReportModal(false)}
                className="px-3 py-1.5 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-xl text-xs font-bold cursor-pointer transition-colors"
              >
                ✕ Kapat
              </button>
            </div>
            <QuizReportView
              session={session}
              onRefreshReport={handleGenerateQuizReport}
              isGeneratingReport={isGeneratingQuizReport}
              onSyncToSheet={handleSyncAnswersToSheet}
              isSyncingToSheet={isSyncingAnswers}
            />
          </div>
        </div>
      )}

      {/* CONFIRMATION MODAL FOR WORKSPACE OPERATIONS */}
      <ConfirmationModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        detail={confirmModal.detail}
        confirmLabel={confirmModal.confirmLabel}
        isDangerous={confirmModal.isDangerous}
        onCancel={() => setConfirmModal((prev) => ({ ...prev, isOpen: false }))}
        onConfirm={async () => {
          setConfirmModal((prev) => ({ ...prev, isOpen: false }));
          if (confirmModal.action) {
            await confirmModal.action();
          }
        }}
      />
    </div>
  );
};
