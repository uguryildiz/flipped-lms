import express from 'express';
import http from 'http';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';

// Common interface types
export interface AikenQuestion {
  id: string;
  courseName: string;
  studentNo: string;
  studentName?: string;
  topic: string;
  question: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  optionE: string;
  answer: string;
  selectionStatus: 'Seçildi' | 'Seçilmedi' | 'Beklemede';
  analysisScore: number;
  analysisFeedback?: string;
  sessionCode: string;
  createdAt: string;
  syncedToSheets?: boolean;
}

export interface QuizAnswer {
  id: string;
  sessionCode: string;
  courseName: string;
  topic: string;
  questionId: string;
  questionIndex: number;
  questionText: string;
  studentNo: string;
  studentName?: string;
  givenAnswer: string;
  correctAnswer: string;
  isCorrect: boolean;
  statusText: 'Doğru' | 'Yanlış';
  timestamp: string;
  syncedToSheets?: boolean;
}

export interface TopicConfig {
  scoreThreshold: number;
  topCount: number;
  selectionMode: 'threshold' | 'top_count' | 'threshold_and_top_count';
  maxQuestionsLimit?: number;
}

export interface QuizReportAnalysis {
  generatedAt: string;
  executiveSummary: string;
  classAverageScore: number;
  totalStudents: number;
  totalAnswers: number;
  topicInsights: Array<{
    topic: string;
    successRate: number;
    totalAnswers: number;
    correctAnswers: number;
    assessment: string;
    status: 'mastered' | 'developing' | 'critical';
    recommendation: string;
  }>;
  distractorAnalysis: Array<{
    questionId: string;
    questionText: string;
    topic: string;
    correctAnswer: string;
    topWrongOption?: string;
    topWrongPercentage?: number;
    misconceptionExplanation: string;
  }>;
  studentGroupings: {
    highAchieversSummary: string;
    needsSupportSummary: string;
    highAchieversCount: number;
    needsSupportCount: number;
  };
  actionableRecommendations: string[];
  strengths: string[];
  areasToImprove: string[];
}

export interface SessionInfo {
  code: string;
  courseName: string;
  topics: string[];
  scoreThreshold: number;
  topCount?: number;
  selectionMode?: 'threshold' | 'top_count' | 'threshold_and_top_count';
  maxAnswerAttemptsPerQuestion?: number;
  maxQuestionsPerStudent?: number;
  maxQuestionsPerTopicPerStudent?: number;
  maxTopicsPerStudent?: number;
  topicConfigs?: Record<string, TopicConfig>;
  status: 'collecting' | 'analyzing' | 'selection_review' | 'quiz_active' | 'finished';
  createdAt: string;
  spreadsheetId?: string;
  spreadsheetUrl?: string;
  lastEvaluationCriteria?: string;
  isEvaluationFinalized?: boolean;
  questions: AikenQuestion[];
  quizState: {
    activeQuestionIndex: number;
    showAnswer: boolean;
    isAcceptingAnswers: boolean;
    startedAt?: string;
  };
  answers: QuizAnswer[];
  quizReport?: QuizReportAnalysis;
}

export interface GeminiAnalysisResult {
  questionId: string;
  score: number;
  selected: boolean;
  feedback: string;
  strengths?: string[];
  improvements?: string[];
}

export type Question = AikenQuestion;
export type Session = SessionInfo;
export type QuizResult = QuizAnswer;

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// In-memory sessions store (starts completely empty, no mock/demo sessions or questions)
const sessions = new Map<string, SessionInfo>();

function applyTopicSelection(session: SessionInfo, topic: string) {
  if (!session.topicConfigs) {
    session.topicConfigs = {};
  }
  const config: TopicConfig = session.topicConfigs[topic] || {
    scoreThreshold: session.scoreThreshold || 75,
    topCount: session.topCount || 2,
    selectionMode: session.selectionMode || 'threshold_and_top_count',
  };

  const topicQuestions = session.questions.filter((q) => q.topic === topic);
  if (topicQuestions.length === 0) return;

  const mode = config.selectionMode || 'threshold_and_top_count';

  if (mode === 'threshold_and_top_count') {
    // Eşik VE En İyi Skoru Alan N Soru:
    // 1. Eşiği geçen soruları filtrele
    const threshold = config.scoreThreshold;
    const qualifying = topicQuestions.filter((q) => q.analysisScore >= threshold);
    // 2. En yüksek skora göre sırala
    const sorted = [...qualifying].sort((a, b) => b.analysisScore - a.analysisScore);
    // 3. En fazla topCount adedini seç
    const targetCount = Math.max(1, config.topCount);
    const selectedIds = new Set(sorted.slice(0, targetCount).map((q) => q.id));

    for (const q of topicQuestions) {
      q.selectionStatus = selectedIds.has(q.id) ? 'Seçildi' : 'Seçilmedi';
    }
  } else if (mode === 'top_count') {
    // Yalnızca En Yüksek Skorlu N Soru
    const sorted = [...topicQuestions].sort((a, b) => b.analysisScore - a.analysisScore);
    const targetCount = Math.max(1, Math.min(sorted.length, config.topCount));
    const selectedIds = new Set(sorted.slice(0, targetCount).map((q) => q.id));

    for (const q of topicQuestions) {
      q.selectionStatus = selectedIds.has(q.id) ? 'Seçildi' : 'Seçilmedi';
    }
  } else {
    // Yalnızca Eşik Tabanlı
    const threshold = config.scoreThreshold;
    for (const q of topicQuestions) {
      if (q.analysisScore > 0) {
        q.selectionStatus = q.analysisScore >= threshold ? 'Seçildi' : 'Seçilmedi';
      }
    }
  }
}

function applyAllTopicsSelection(session: SessionInfo) {
  const topics = session.topics && session.topics.length > 0 ? session.topics : [];
  const allTopics = Array.from(new Set([...topics, ...session.questions.map((q) => q.topic)]));
  for (const t of allTopics) {
    applyTopicSelection(session, t);
  }
}

function generateUnique5DigitCode(): string {
  let code = '';
  do {
    code = Math.floor(10000 + Math.random() * 90000).toString();
  } while (sessions.has(code));
  return code;
}

async function startServer() {
  const app = express();
  const portArgIndex = process.argv.indexOf('--port');
  const cliPort = portArgIndex !== -1 && process.argv[portArgIndex + 1] ? Number(process.argv[portArgIndex + 1]) : null;
  const PORT = cliPort || process.env.PORT || 3000;

  app.use(express.json({ limit: '10mb' }));

  // Gemini AI client on server side only
  const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });

  // In-memory rate limiting to protect against abuse, bot attacks, and resource exhaustion
  interface RateLimitRecord {
    count: number;
    resetTime: number;
  }
  const generalRateLimits = new Map<string, RateLimitRecord>();
  const aiRateLimits = new Map<string, RateLimitRecord>();

  const createRateLimiter = (windowMs: number, maxRequests: number, storage: Map<string, RateLimitRecord>) => {
    return (req: express.Request, res: express.Response, next: express.NextFunction) => {
      const forwarded = req.headers['x-forwarded-for'];
      const ip = (typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : null) || req.socket.remoteAddress || 'unknown';
      const now = Date.now();
      const record = storage.get(ip);

      if (!record || now > record.resetTime) {
        storage.set(ip, { count: 1, resetTime: now + windowMs });
        return next();
      }

      if (record.count >= maxRequests) {
        const retrySec = Math.ceil((record.resetTime - now) / 1000);
        res.setHeader('Retry-After', retrySec);
        return res.status(429).json({
          error: `Çok fazla istek gönderildi. Lütfen ${retrySec} saniye sonra tekrar deneyiniz.`,
          retryAfter: retrySec,
        });
      }

      record.count++;
      return next();
    };
  };

  // General API protection: max 120 requests per minute per IP
  app.use('/api', createRateLimiter(60 * 1000, 120, generalRateLimits));

  // AI-specific protection: max 6 requests per minute per IP
  const aiRateLimiter = createRateLimiter(60 * 1000, 6, aiRateLimits);

  // Concurrency mutex and cooldown per session for AI calls
  const activeAiOperations = new Set<string>();
  const lastAiOperationTime = new Map<string, number>();

  // REST API Routes

  // Teacher Authentication (credentials from environment variables)
  const TEACHER_REG_NO = (process.env.TEACHER_REGISTRATION_NO || '2699').trim();
  const TEACHER_PASSWORD = (process.env.TEACHER_PASSWORD || 'DigiNova1324').trim();

  app.post('/api/auth/teacher/login', (req, res) => {
    const { registrationNo, password } = req.body || {};
    if (!registrationNo || !password) {
      return res.status(400).json({ error: 'Lütfen sicil numarası ve şifrenizi giriniz.' });
    }

    if (
      registrationNo.toString().trim() === TEACHER_REG_NO &&
      password.toString().trim() === TEACHER_PASSWORD
    ) {
      return res.json({
        success: true,
        teacher: {
          registrationNo: TEACHER_REG_NO,
          title: 'Öğretim Üyesi',
        },
      });
    }

    return res.status(401).json({
      error: 'Hatalı sicil numarası veya şifre girdiniz. Lütfen bilgilerinizi kontrol ediniz.',
    });
  });

  // 1. Create a session
  app.post('/api/sessions', (req, res) => {
    try {
      const {
        courseName,
        topics,
        scoreThreshold,
        topCount,
        selectionMode,
        maxAnswerAttemptsPerQuestion,
        maxQuestionsPerStudent,
        maxQuestionsPerTopicPerStudent,
        maxTopicsPerStudent,
      } = req.body;
      if (!courseName || !courseName.trim()) {
        return res.status(400).json({ error: 'Ders adı gereklidir.' });
      }

      const validTopics = Array.isArray(topics) && topics.length > 0
        ? topics.map((t: string) => t.trim()).filter((t: string) => t.length > 0)
        : ['Genel Konu'];

      const code = generateUnique5DigitCode();
      const defaultThreshold = typeof scoreThreshold === 'number' ? scoreThreshold : 75;
      const defaultTopCount = typeof topCount === 'number' && topCount > 0 ? topCount : 2;
      const defaultMode = selectionMode || 'threshold_and_top_count';

      const initialTopicConfigs: Record<string, TopicConfig> = {};
      for (const t of validTopics) {
        initialTopicConfigs[t] = {
          scoreThreshold: defaultThreshold,
          topCount: defaultTopCount,
          selectionMode: defaultMode,
        };
      }

      const newSession: SessionInfo = {
        code,
        courseName: courseName.trim(),
        topics: validTopics,
        scoreThreshold: defaultThreshold,
        topCount: defaultTopCount,
        selectionMode: defaultMode,
        maxAnswerAttemptsPerQuestion:
          typeof maxAnswerAttemptsPerQuestion === 'number' && maxAnswerAttemptsPerQuestion > 0
            ? maxAnswerAttemptsPerQuestion
            : 1,
        maxQuestionsPerStudent:
          typeof maxQuestionsPerStudent === 'number' && maxQuestionsPerStudent > 0
            ? maxQuestionsPerStudent
            : 1,
        maxQuestionsPerTopicPerStudent:
          typeof maxQuestionsPerTopicPerStudent === 'number' && maxQuestionsPerTopicPerStudent > 0
            ? maxQuestionsPerTopicPerStudent
            : 1,
        maxTopicsPerStudent:
          typeof maxTopicsPerStudent === 'number' && maxTopicsPerStudent > 0
            ? maxTopicsPerStudent
            : 0,
        topicConfigs: initialTopicConfigs,
        status: 'collecting',
        createdAt: new Date().toISOString(),
        questions: [],
        quizState: {
          activeQuestionIndex: 0,
          showAnswer: false,
          isAcceptingAnswers: true,
        },
        answers: [],
      };

      sessions.set(code, newSession);
      return res.status(201).json(newSession);
    } catch (err: unknown) {
      console.error('Session create error:', err);
      return res.status(500).json({ error: 'Session oluşturulamadı.' });
    }
  });

  // 1b. List all sessions
  app.get('/api/sessions', (req, res) => {
    const list = Array.from(sessions.values());
    return res.json(list);
  });

  // 1c. Get latest created session
  app.get('/api/sessions/latest', (req, res) => {
    const list = Array.from(sessions.values());
    if (list.length === 0) {
      return res.status(404).json({ error: 'Henüz aktif bir oturum bulunmuyor.' });
    }
    return res.json(list[list.length - 1]);
  });

  // 2. Get session info
  app.get('/api/sessions/:code', (req, res) => {
    const session = sessions.get(req.params.code);
    if (!session) {
      return res.status(404).json({ error: 'Oturum (Session) bulunamadı. Lütfen 5 haneli kodu kontrol ediniz.' });
    }
    return res.json(session);
  });

  // 3. Link Google Sheet to session
  app.post('/api/sessions/:code/link-sheet', (req, res) => {
    const session = sessions.get(req.params.code);
    if (!session) {
      return res.status(404).json({ error: 'Session bulunamadı.' });
    }
    const { spreadsheetId, spreadsheetUrl } = req.body;
    session.spreadsheetId = spreadsheetId;
    session.spreadsheetUrl = spreadsheetUrl;
    return res.json(session);
  });

  // 3b. Update session settings (Course Name, Topics, Threshold, TopCount, SelectionMode, Attempts Limit)
  app.post('/api/sessions/:code/settings', (req, res) => {
    const session = sessions.get(req.params.code);
    if (!session) {
      return res.status(404).json({ error: 'Session bulunamadı.' });
    }

    const {
      courseName,
      topics,
      scoreThreshold,
      topCount,
      selectionMode,
      maxAnswerAttemptsPerQuestion,
      maxQuestionsPerStudent,
      maxQuestionsPerTopicPerStudent,
      maxTopicsPerStudent,
    } = req.body;

    if (courseName && courseName.trim()) {
      session.courseName = courseName.trim();
      // Update courseName on existing questions too
      for (const q of session.questions) {
        q.courseName = session.courseName;
      }
    }

    if (typeof scoreThreshold === 'number' && scoreThreshold >= 0 && scoreThreshold <= 100) {
      session.scoreThreshold = scoreThreshold;
    }

    if (typeof topCount === 'number' && topCount > 0) {
      session.topCount = topCount;
    }

    if (selectionMode && ['threshold', 'top_count', 'threshold_and_top_count'].includes(selectionMode)) {
      session.selectionMode = selectionMode;
    }

    if (Array.isArray(topics) && topics.length > 0) {
      session.topics = topics
        .map((t: string) => t.trim())
        .filter((t: string) => t.length > 0);
    }

    if (!session.topicConfigs) {
      session.topicConfigs = {};
    }

    // Keep all topics configured with session defaults
    for (const t of session.topics) {
      if (!session.topicConfigs[t]) {
        session.topicConfigs[t] = {
          scoreThreshold: session.scoreThreshold || 75,
          topCount: session.topCount || 2,
          selectionMode: session.selectionMode || 'threshold_and_top_count',
        };
      } else {
        if (typeof scoreThreshold === 'number') {
          session.topicConfigs[t].scoreThreshold = scoreThreshold;
        }
        if (typeof topCount === 'number') {
          session.topicConfigs[t].topCount = topCount;
        }
        if (selectionMode) {
          session.topicConfigs[t].selectionMode = selectionMode;
        }
      }
    }

    // Apply question selection immediately
    applyAllTopicsSelection(session);

    if (typeof maxAnswerAttemptsPerQuestion === 'number' && maxAnswerAttemptsPerQuestion > 0) {
      session.maxAnswerAttemptsPerQuestion = maxAnswerAttemptsPerQuestion;
    }

    if (typeof maxQuestionsPerStudent === 'number' && maxQuestionsPerStudent > 0) {
      session.maxQuestionsPerStudent = maxQuestionsPerStudent;
    }

    if (typeof maxQuestionsPerTopicPerStudent === 'number' && maxQuestionsPerTopicPerStudent > 0) {
      session.maxQuestionsPerTopicPerStudent = maxQuestionsPerTopicPerStudent;
    }

    if (typeof maxTopicsPerStudent === 'number' && maxTopicsPerStudent >= 0) {
      session.maxTopicsPerStudent = maxTopicsPerStudent;
    }

    return res.json(session);
  });

  // Helper to determine question limit per topic
  function getTopicMaxQuestionsLimit(session: SessionInfo, topic: string): number {
    const cleanTopic = (topic || '').trim();
    const cfg = session.topicConfigs?.[cleanTopic];
    if (cfg && typeof cfg.maxQuestionsLimit === 'number' && cfg.maxQuestionsLimit > 0) {
      return cfg.maxQuestionsLimit;
    }
    return session.maxQuestionsPerTopicPerStudent || 1;
  }

  // 4. Submit questions (Student) - Supports both single question and batch of questions at once!
  app.post('/api/sessions/:code/questions', (req, res) => {
    const session = sessions.get(req.params.code);
    if (!session) {
      return res.status(404).json({ error: 'Session bulunamadı.' });
    }

    if (session.status !== 'collecting') {
      return res.status(400).json({ error: 'Bu oturumda soru toplama süreci tamamlanmıştır.' });
    }

    const studentNoStr = (req.body.studentNo || '').toString().trim();
    if (!/^\d{9}$/.test(studentNoStr)) {
      return res.status(400).json({ error: 'Öğrenci numarası sadece rakamlardan oluşan 9 haneli bir numara olmalıdır.' });
    }

    const maxAllowedQuestions = session.maxQuestionsPerStudent || 1;
    const existingStudentQuestions = session.questions.filter(
      (q) => q.studentNo.trim() === studentNoStr
    );

    if (existingStudentQuestions.length >= maxAllowedQuestions) {
      return res.status(400).json({
        error: `Bu oturum için öğrenci başına belirlenen genel soru yükleme sınırına (${maxAllowedQuestions} soru) ulaştınız. Yeni soru eklenemez.`,
        limitReached: true,
        maxAllowed: maxAllowedQuestions,
        currentCount: existingStudentQuestions.length,
      });
    }

    // Check if batch questions payload is provided
    if (Array.isArray(req.body.questions)) {
      const { studentName, questions } = req.body;
      const cleanStudentName = (studentName || '').toString().trim();
      if (!cleanStudentName) {
        return res.status(400).json({ error: 'Öğrenci Ad Soyad alanı zorunludur.' });
      }

      if (questions.length === 0) {
        return res.status(400).json({ error: 'Eklenecek soru bulunamadı.' });
      }

      const remainingSlots = maxAllowedQuestions - existingStudentQuestions.length;
      if (questions.length > remainingSlots) {
        return res.status(400).json({
          error: `Genel soru yükleme sınırı aşıldı! En fazla ${maxAllowedQuestions} soru girebilirsiniz. Kalan hakkınız: ${remainingSlots} adet soru.`,
          limitReached: true,
          maxAllowed: maxAllowedQuestions,
          remainingSlots,
        });
      }

      // Check max topics limit for student (if configured)
      const maxTopicsAllowed = session.maxTopicsPerStudent || 0;
      if (maxTopicsAllowed > 0) {
        const studentTopicsSet = new Set(
          existingStudentQuestions.map((q) => q.topic.trim().toLowerCase())
        );
        for (const item of questions) {
          const itemTopic = ((item.topic && item.topic.trim()) || session.topics[0] || 'Genel Konu').toLowerCase();
          studentTopicsSet.add(itemTopic);
        }
        if (studentTopicsSet.size > maxTopicsAllowed) {
          return res.status(400).json({
            error: `Öğrenci başına en fazla ${maxTopicsAllowed} farklı konuya soru gönderme sınırına ulaşıldı. Bu sorularla birlikte ${studentTopicsSet.size} farklı konuya ulaşılıyor.`,
            maxTopicsLimitReached: true,
            maxAllowedTopics: maxTopicsAllowed,
            currentTopicCount: studentTopicsSet.size,
          });
        }
      }

      // Check per-topic limits for the batch
      const topicCounts: Record<string, number> = {};
      for (const q of existingStudentQuestions) {
        const t = q.topic.trim().toLowerCase();
        topicCounts[t] = (topicCounts[t] || 0) + 1;
      }

      for (const item of questions) {
        const itemTopic = (item.topic && item.topic.trim()) || session.topics[0] || 'Genel Konu';
        const limit = getTopicMaxQuestionsLimit(session, itemTopic);
        const lowerTopic = itemTopic.toLowerCase();
        const currentCount = topicCounts[lowerTopic] || 0;
        if (currentCount + 1 > limit) {
          return res.status(400).json({
            error: `"${itemTopic}" konusu için belirlenen soru sorma sınırına (${limit} soru) ulaşıldı. Bu konuya daha fazla soru ekleyemezsiniz.`,
            topicLimitReached: true,
            maxAllowedPerTopic: limit,
            topic: itemTopic,
          });
        }
        topicCounts[lowerTopic] = currentCount + 1;
      }

      const addedQuestions: AikenQuestion[] = [];

      for (let i = 0; i < questions.length; i++) {
        const item = questions[i];
        const cleanAnswer = (item.answer || '').toString().trim().toUpperCase();

        if (
          !item.question ||
          !item.optionA ||
          !item.optionB ||
          !item.optionC ||
          !item.optionD ||
          !item.optionE ||
          !['A', 'B', 'C', 'D', 'E'].includes(cleanAnswer)
        ) {
          continue; // Skip invalid item
        }

        const newQuestion: AikenQuestion = {
          id: `q-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          courseName: session.courseName,
          studentNo: studentNoStr,
          studentName: cleanStudentName,
          topic: (item.topic && item.topic.trim()) || session.topics[0] || 'Genel Konu',
          question: item.question.trim(),
          optionA: item.optionA.trim(),
          optionB: item.optionB.trim(),
          optionC: item.optionC.trim(),
          optionD: item.optionD.trim(),
          optionE: item.optionE.trim(),
          answer: cleanAnswer,
          selectionStatus: 'Beklemede',
          analysisScore: 0,
          sessionCode: session.code,
          createdAt: new Date().toISOString(),
        };

        session.questions.push(newQuestion);
        addedQuestions.push(newQuestion);
      }

      if (addedQuestions.length === 0) {
        return res.status(400).json({
          error: 'Geçerli formatta soru bulunamadı. Lütfen 5 seçenek (A, B, C, D, E) ve ANSWER alanlarını kontrol ediniz.',
        });
      }

      return res.status(201).json({
        message: `${addedQuestions.length} adet soru başarıyla eklendi.`,
        count: addedQuestions.length,
        questions: addedQuestions,
        session,
      });
    }

    // Single question payload
    const {
      studentName,
      topic,
      question,
      optionA,
      optionB,
      optionC,
      optionD,
      optionE,
      answer,
    } = req.body;

    const cleanStudentName = (studentName || '').toString().trim();
    if (!cleanStudentName) {
      return res.status(400).json({ error: 'Öğrenci Ad Soyad alanı zorunludur.' });
    }

    if (!question || !optionA || !optionB || !optionC || !optionD || !optionE || !answer) {
      return res.status(400).json({ error: 'Tüm alanlar ve 5 seçenek (A, B, C, D, E) eksiksiz girilmelidir.' });
    }

    const cleanAnswer = answer.toString().trim().toUpperCase();
    if (!['A', 'B', 'C', 'D', 'E'].includes(cleanAnswer)) {
      return res.status(400).json({ error: 'Doğru cevap A, B, C, D veya E olmalıdır.' });
    }

    const targetTopic = (topic || session.topics[0] || 'Genel Konu').toString().trim();

    // Check student max topics limit
    const maxTopicsAllowed = session.maxTopicsPerStudent || 0;
    if (maxTopicsAllowed > 0) {
      const existingTopicsSet = new Set(
        existingStudentQuestions.map((q) => q.topic.trim().toLowerCase())
      );
      if (!existingTopicsSet.has(targetTopic.toLowerCase()) && existingTopicsSet.size >= maxTopicsAllowed) {
        return res.status(400).json({
          error: `Öğrenci başına en fazla ${maxTopicsAllowed} farklı konuya soru sorma sınırına ulaştınız. Halihazırda ${existingTopicsSet.size} farklı konuya soru gönderdiniz.`,
          maxTopicsLimitReached: true,
          maxAllowedTopics: maxTopicsAllowed,
          currentTopicCount: existingTopicsSet.size,
        });
      }
    }

    const maxPerTopic = getTopicMaxQuestionsLimit(session, targetTopic);
    const studentTopicQuestions = existingStudentQuestions.filter(
      (q) => q.topic.trim().toLowerCase() === targetTopic.toLowerCase()
    );

    if (studentTopicQuestions.length >= maxPerTopic) {
      return res.status(400).json({
        error: `"${targetTopic}" konusu için belirlenen soru sorma sınırına (${maxPerTopic} soru) ulaştınız. Lütfen başka bir konu başlığı seçiniz.`,
        topicLimitReached: true,
        maxAllowedPerTopic: maxPerTopic,
        currentTopicCount: studentTopicQuestions.length,
      });
    }

    const newQuestion: AikenQuestion = {
      id: `q-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      courseName: session.courseName,
      studentNo: studentNoStr,
      studentName: cleanStudentName,
      topic: targetTopic,
      question: question.trim(),
      optionA: optionA.trim(),
      optionB: optionB.trim(),
      optionC: optionC.trim(),
      optionD: optionD.trim(),
      optionE: optionE.trim(),
      answer: cleanAnswer,
      selectionStatus: 'Beklemede',
      analysisScore: 0,
      sessionCode: session.code,
      createdAt: new Date().toISOString(),
    };

    session.questions.push(newQuestion);
    return res.status(201).json(newQuestion);
  });

  // 4b. Update / Edit a question (Student can modify own submitted question before quiz)
  app.put('/api/sessions/:code/questions/:id', (req, res) => {
    const session = sessions.get(req.params.code);
    if (!session) {
      return res.status(404).json({ error: 'Session bulunamadı.' });
    }

    if (session.status === 'quiz_active' || session.status === 'finished') {
      return res.status(400).json({ error: 'Quiz süreci başladıktan sonra sorular üzerinde değişiklik yapılamaz.' });
    }

    const questionIndex = session.questions.findIndex((q) => q.id === req.params.id);
    if (questionIndex === -1) {
      return res.status(404).json({ error: 'Düzenlenecek soru bulunamadı.' });
    }

    const currentQ = session.questions[questionIndex];
    const studentNoStr = (req.body.studentNo || '').toString().trim();

    // Verify ownership: student must match the question's studentNo
    if (!studentNoStr || currentQ.studentNo.trim() !== studentNoStr) {
      return res.status(403).json({ error: 'Yalnızca kendi eklediğiniz sorular üzerinde değişiklik yapabilirsiniz.' });
    }

    const {
      topic,
      question,
      optionA,
      optionB,
      optionC,
      optionD,
      optionE,
      answer,
    } = req.body;

    if (!question || !optionA || !optionB || !optionC || !optionD || !optionE || !answer) {
      return res.status(400).json({ error: 'Tüm soru metni ve 5 seçenek (A, B, C, D, E) eksiksiz girilmelidir.' });
    }

    const cleanAnswer = answer.toString().trim().toUpperCase();
    if (!['A', 'B', 'C', 'D', 'E'].includes(cleanAnswer)) {
      return res.status(400).json({ error: 'Doğru cevap A, B, C, D veya E olmalıdır.' });
    }

    const targetTopic = (topic || currentQ.topic || session.topics[0] || 'Genel Konu').toString().trim();

    // If changing topic, verify limit on new topic (excluding this question)
    if (targetTopic.toLowerCase() !== currentQ.topic.trim().toLowerCase()) {
      const maxPerNewTopic = getTopicMaxQuestionsLimit(session, targetTopic);
      const studentOtherTopicQuestions = session.questions.filter(
        (q) =>
          q.id !== currentQ.id &&
          q.studentNo.trim() === studentNoStr &&
          q.topic.trim().toLowerCase() === targetTopic.toLowerCase()
      );
      if (studentOtherTopicQuestions.length >= maxPerNewTopic) {
        return res.status(400).json({
          error: `"${targetTopic}" konusu için belirlenen soru sınırına (${maxPerNewTopic} soru) ulaşıldığından soru bu konuya taşınamaz.`,
          topicLimitReached: true,
          maxAllowedPerTopic: maxPerNewTopic,
        });
      }

      const maxTopicsAllowed = session.maxTopicsPerStudent || 0;
      if (maxTopicsAllowed > 0 && studentOtherTopicQuestions.length === 0) {
        const studentOtherTopics = new Set(
          session.questions
            .filter((q) => q.id !== currentQ.id && q.studentNo.trim() === studentNoStr)
            .map((q) => q.topic.trim().toLowerCase())
        );
        if (studentOtherTopics.size >= maxTopicsAllowed) {
          return res.status(400).json({
            error: `Öğrenci başına en fazla ${maxTopicsAllowed} farklı konuya soru sorma sınırına ulaşıldığından soru bu yeni konuya taşınamaz.`,
            maxTopicsLimitReached: true,
            maxAllowedTopics: maxTopicsAllowed,
          });
        }
      }
    }

    // Apply updates
    currentQ.topic = targetTopic;
    currentQ.question = question.trim();
    currentQ.optionA = optionA.trim();
    currentQ.optionB = optionB.trim();
    currentQ.optionC = optionC.trim();
    currentQ.optionD = optionD.trim();
    currentQ.optionE = optionE.trim();
    currentQ.answer = cleanAnswer;
    currentQ.selectionStatus = 'Beklemede';
    currentQ.analysisScore = 0;
    delete currentQ.analysisFeedback;

    return res.json({
      message: 'Sorunuz başarıyla güncellendi.',
      question: currentQ,
      session,
    });
  });

  // 4c. Delete a question (Student can delete own question; frees up their quota)
  app.delete('/api/sessions/:code/questions/:id', (req, res) => {
    const session = sessions.get(req.params.code);
    if (!session) {
      return res.status(404).json({ error: 'Session bulunamadı.' });
    }

    if (session.status === 'quiz_active' || session.status === 'finished') {
      return res.status(400).json({ error: 'Quiz başladıktan sonra sorular silinemez.' });
    }

    const questionIndex = session.questions.findIndex((q) => q.id === req.params.id);
    if (questionIndex === -1) {
      return res.status(404).json({ error: 'Silinecek soru bulunamadı.' });
    }

    const currentQ = session.questions[questionIndex];
    const studentNoStr = (req.body?.studentNo || req.query?.studentNo || '').toString().trim();
    const isTeacher = req.query?.teacher === 'true' || req.body?.teacher === true;

    // Verify ownership unless teacher is performing action
    if (!isTeacher) {
      if (!studentNoStr || currentQ.studentNo.trim() !== studentNoStr) {
        return res.status(403).json({ error: 'Yalnızca kendi eklediğiniz soruları silebilirsiniz.' });
      }
    }

    // Remove the question
    session.questions.splice(questionIndex, 1);

    // Reapply topic selections if in review mode
    if (session.status === 'selection_review') {
      applyAllTopicsSelection(session);
    }

    return res.json({
      message: 'Sorunuz başarıyla silindi. Soru hazırlama hakkınız geri yüklendi.',
      deletedQuestionId: req.params.id,
      session,
    });
  });

  // 5. Analyze questions with Google Gemini (Supports additional teacher criteria and iterative re-evaluation)
  app.post('/api/sessions/:code/analyze', aiRateLimiter, async (req, res) => {
    const code = req.params.code;
    const session = sessions.get(code);
    if (!session) {
      return res.status(404).json({ error: 'Session bulunamadı.' });
    }

    if (activeAiOperations.has(`analyze_${code}`)) {
      return res.status(429).json({ error: 'Bu oturum için analiz işlemi zaten devam etmektedir. Lütfen bekleyiniz.' });
    }

    const lastTime = lastAiOperationTime.get(`analyze_${code}`) || 0;
    if (Date.now() - lastTime < 10000) {
      const waitSec = Math.ceil((10000 - (Date.now() - lastTime)) / 1000);
      return res.status(429).json({ error: `Analiz talepleri arasında en az 10 saniye beklenmelidir. Kalan süre: ${waitSec} sn.` });
    }

    if (session.questions.length === 0) {
      return res.status(400).json({ error: 'Analiz edilecek soru bulunamadı. Lütfen öğrencilerin soru yüklemesini bekleyin.' });
    }

    activeAiOperations.add(`analyze_${code}`);
    lastAiOperationTime.set(`analyze_${code}`, Date.now());

    const { additionalCriteria } = req.body || {};
    session.lastEvaluationCriteria = additionalCriteria?.trim() || '';
    session.isEvaluationFinalized = false; // Reset finalized state so teacher can review

    try {
      session.status = 'analyzing';

      // Prepare payload for Gemini
      const questionsData = session.questions.map((q, index) => ({
        index: index + 1,
        id: q.id,
        topic: q.topic,
        question: q.question,
        options: {
          A: q.optionA,
          B: q.optionB,
          C: q.optionC,
          D: q.optionD,
          E: q.optionE,
        },
        answer: q.answer,
      }));

      let prompt = `Aşağıda "${session.courseName}" dersinde öğrenciler tarafından o gün anlatılan konular hakkında hazırlanmış 5 seçenekli test soruları verilmiştir.
Sen uzman bir öğretim üyesi ve ölçme-değerlendirme uzmanısın.
Her bir soruyu şu pedagojik kriterlere göre titizlikle incele:
1. Soru kökünün netliği, anlaşılırlığı ve dil bilgisi düzeyi
2. Belirtilen doğru cevabın bilimsel ve mantıksal doğruluğu
3. 5 seçeneğin kalitesi: Çeldiricilerin makul, dengeli ve öğretici olup olmadığı
4. Bilişsel seviye (yalnızca kuru ezber yerine kavrama, uygulama veya analiz düzeyinde soru hazırlanmış mı)`;

      if (session.lastEvaluationCriteria) {
        prompt += `\n\nÖĞRETMENİN ÖZEL DEĞERLENDİRME VE SEÇİM TALİMATLARI / EK KRİTERLERİ:\n"${session.lastEvaluationCriteria}"\nPuanlama yaparken ve en iyi soruları seçerken öğretmenin bu özel talimatlarını ve vurguladığı kriterleri öncelikli olarak dikkate al.`;
      }

      prompt += `\n\nHer bir soru için 0 ile 100 arasında bir "score" (Analiz Skoru) belirle.
Ayrıca Türkçe kısa bir gerekçe/değerlendirme ("feedback") yaz.

Sorular:
${JSON.stringify(questionsData, null, 2)}`;

      let analysisResults: Array<{ id: string; score: number; feedback: string }> = [];
      const modelsToTry = ['gemini-3.8-flash', 'gemini-flash-latest', 'gemini-3.1-flash-lite'];
      let succeeded = false;

      for (const modelName of modelsToTry) {
        try {
          const response = await ai.models.generateContent({
            model: modelName,
            contents: prompt,
            config: {
              responseMimeType: 'application/json',
              responseSchema: {
                type: Type.ARRAY,
                description: 'Soruların analiz sonuçları listesi',
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.STRING, description: 'Sorunun benzersiz id değeri' },
                    score: { type: Type.INTEGER, description: '0 ile 100 arasında kalite puanı' },
                    feedback: { type: Type.STRING, description: 'Öğretmene yönelik Türkçe analiz özeti' },
                  },
                  required: ['id', 'score', 'feedback'],
                },
              },
            },
          });

          const responseText = response.text || '[]';
          analysisResults = JSON.parse(responseText);
          succeeded = true;
          break;
        } catch (callErr: unknown) {
          const errMsg = callErr instanceof Error ? callErr.message : String(callErr);
          console.warn(`Model ${modelName} call failed:`, errMsg);

          // If quota exceeded, suspended or permission denied, stop calling further models
          if (
            errMsg.includes('429') ||
            errMsg.includes('RESOURCE_EXHAUSTED') ||
            errMsg.includes('403') ||
            errMsg.includes('PERMISSION_DENIED') ||
            errMsg.includes('suspended') ||
            errMsg.includes('API key')
          ) {
            console.warn('Google Cloud quota or permission issue. Using heuristic evaluation fallback immediately.');
            break;
          }
          await new Promise((r) => setTimeout(r, 600));
        }
      }

      // If all Gemini calls failed due to transient cloud demand, provide heuristic evaluation
      if (!succeeded || analysisResults.length === 0) {
        analysisResults = session.questions.map((q) => {
          let score = 75;
          const reasons: string[] = [];

          if (q.question.length > 50) {
            score += 10;
            reasons.push('Soru kökü detaylı ve açıklayıcı.');
          } else {
            reasons.push('Soru kökü kısa ve öz.');
          }

          const opts = [q.optionA, q.optionB, q.optionC, q.optionD, q.optionE];
          const hasEmpty = opts.some((o) => !o || o.trim().length === 0);
          if (!hasEmpty) {
            score += 10;
            reasons.push('5 seçeneğin tümü eksiksiz girilmiş.');
          }

          if (q.answer && ['A', 'B', 'C', 'D', 'E'].includes(q.answer)) {
            reasons.push(`Belirlenen cevap (${q.answer}) geçerli formattadır.`);
          }

          return {
            id: q.id,
            score: Math.min(95, Math.max(60, score)),
            feedback: reasons.join(' '),
          };
        });
      }

      // Apply scores
      for (const resItem of analysisResults) {
        const targetQ = session.questions.find((q) => q.id === resItem.id);
        if (targetQ) {
          targetQ.analysisScore = Math.min(100, Math.max(0, resItem.score));
          targetQ.analysisFeedback = resItem.feedback;
        }
      }

      // For any question not in the response, assign default score
      for (const q of session.questions) {
        if (!analysisResults.some((r) => r.id === q.id)) {
          q.analysisScore = 70;
          q.analysisFeedback = 'Otomatik değerlendirildi.';
        }
      }

      // Apply per-topic selection rules (threshold or topCount)
      applyAllTopicsSelection(session);

      session.status = 'selection_review';
      return res.json({
        message: 'Analiz tamamlandı. Sorular konu bazlı kurallara göre değerlendirildi.',
        session,
        selectedCount: session.questions.filter((q) => q.selectionStatus === 'Seçildi').length,
        totalCount: session.questions.length,
      });
    } catch (err: unknown) {
      console.error('Gemini analysis error:', err);
      session.status = 'collecting';
      return res.status(500).json({
        error: 'Gemini analizi sırasında bir hata oluştu: ' + (err instanceof Error ? err.message : String(err)),
      });
    } finally {
      activeAiOperations.delete(`analyze_${code}`);
    }
  });

  // 6. Update global score threshold and re-evaluate selection status
  app.post('/api/sessions/:code/threshold', (req, res) => {
    const session = sessions.get(req.params.code);
    if (!session) {
      return res.status(404).json({ error: 'Session bulunamadı.' });
    }

    const { threshold } = req.body;
    if (typeof threshold !== 'number' || threshold < 0 || threshold > 100) {
      return res.status(400).json({ error: 'Eşik 0-100 arasında bir sayı olmalıdır.' });
    }

    session.scoreThreshold = threshold;
    if (!session.topicConfigs) session.topicConfigs = {};
    for (const t of session.topics) {
      if (session.topicConfigs[t]) {
        session.topicConfigs[t].scoreThreshold = threshold;
      }
    }
    applyAllTopicsSelection(session);

    return res.json(session);
  });

  // 6b. Select top N questions globally
  app.post('/api/sessions/:code/select-top', (req, res) => {
    const session = sessions.get(req.params.code);
    if (!session) {
      return res.status(404).json({ error: 'Session bulunamadı.' });
    }

    const { count } = req.body;
    const targetCount = Math.max(1, Math.min(session.questions.length, Number(count) || 1));

    // Sort questions by analysisScore descending
    const sorted = [...session.questions].sort((a, b) => b.analysisScore - a.analysisScore);
    const topIds = new Set(sorted.slice(0, targetCount).map((q) => q.id));

    for (const q of session.questions) {
      q.selectionStatus = topIds.has(q.id) ? 'Seçildi' : 'Seçilmedi';
    }

    return res.json({
      message: `En yüksek puanlı ${targetCount} soru başarıyla seçildi.`,
      session,
      selectedCount: targetCount,
    });
  });

  // 6c. Configure threshold / topCount for a specific topic or all topics in bulk
  app.post('/api/sessions/:code/topics/config', (req, res) => {
    const session = sessions.get(req.params.code);
    if (!session) {
      return res.status(404).json({ error: 'Session bulunamadı.' });
    }

    if (!session.topicConfigs) {
      session.topicConfigs = {};
    }

    // Bulk update support
    if (req.body.topicConfigs && typeof req.body.topicConfigs === 'object') {
      const incoming = req.body.topicConfigs;
      for (const [topName, cfg] of Object.entries(incoming)) {
        if (!cfg || typeof cfg !== 'object') continue;
        const c = cfg as Partial<TopicConfig>;
        const prev = session.topicConfigs[topName] || {
          scoreThreshold: session.scoreThreshold || 75,
          topCount: 1,
          selectionMode: 'threshold',
        };
        session.topicConfigs[topName] = {
          scoreThreshold:
            typeof c.scoreThreshold === 'number' && c.scoreThreshold >= 0 && c.scoreThreshold <= 100
              ? c.scoreThreshold
              : prev.scoreThreshold,
          topCount: typeof c.topCount === 'number' && c.topCount > 0 ? c.topCount : prev.topCount,
          selectionMode:
            c.selectionMode && ['threshold', 'top_count', 'threshold_and_top_count'].includes(c.selectionMode)
              ? c.selectionMode
              : prev.selectionMode || 'threshold_and_top_count',
          maxQuestionsLimit:
            typeof c.maxQuestionsLimit === 'number' && c.maxQuestionsLimit > 0
              ? c.maxQuestionsLimit
              : prev.maxQuestionsLimit,
        };
      }
      applyAllTopicsSelection(session);

      return res.json({
        message: 'Tüm konu kuralları başarıyla güncellendi.',
        session,
        topicConfigs: session.topicConfigs,
        totalSelected: session.questions.filter((q) => q.selectionStatus === 'Seçildi').length,
      });
    }

    // Single topic update
    const { topic, scoreThreshold, topCount, selectionMode, maxQuestionsLimit } = req.body;
    if (!topic || typeof topic !== 'string') {
      return res.status(400).json({ error: 'Konu başlığı belirtilmelidir.' });
    }

    const prev = session.topicConfigs[topic] || {
      scoreThreshold: session.scoreThreshold || 75,
      topCount: session.topCount || 2,
      selectionMode: session.selectionMode || 'threshold_and_top_count',
    };

    session.topicConfigs[topic] = {
      scoreThreshold:
        typeof scoreThreshold === 'number' && scoreThreshold >= 0 && scoreThreshold <= 100
          ? scoreThreshold
          : prev.scoreThreshold,
      topCount: typeof topCount === 'number' && topCount > 0 ? topCount : prev.topCount,
      selectionMode:
        selectionMode && ['threshold', 'top_count', 'threshold_and_top_count'].includes(selectionMode)
          ? selectionMode
          : prev.selectionMode,
      maxQuestionsLimit:
        typeof maxQuestionsLimit === 'number' && maxQuestionsLimit > 0
          ? maxQuestionsLimit
          : prev.maxQuestionsLimit,
    };

    applyTopicSelection(session, topic);

    return res.json({
      message: `"${topic}" konusu için seçim kuralları güncellendi.`,
      session,
      topicConfig: session.topicConfigs[topic],
      selectedInTopic: session.questions.filter((q) => q.topic === topic && q.selectionStatus === 'Seçildi').length,
      totalSelected: session.questions.filter((q) => q.selectionStatus === 'Seçildi').length,
    });
  });

  // 7. Manual override selection status
  app.post('/api/sessions/:code/override-selection', (req, res) => {
    const session = sessions.get(req.params.code);
    if (!session) {
      return res.status(404).json({ error: 'Session bulunamadı.' });
    }

    const { questionId, status } = req.body;
    const q = session.questions.find((item) => item.id === questionId);
    if (!q) {
      return res.status(404).json({ error: 'Soru bulunamadı.' });
    }

    if (status !== 'Seçildi' && status !== 'Seçilmedi') {
      return res.status(400).json({ error: 'Durum Seçildi veya Seçilmedi olmalıdır.' });
    }

    q.selectionStatus = status;
    return res.json({ question: q, session });
  });

  // 7b. Finalize evaluation by teacher
  app.post('/api/sessions/:code/finalize-evaluation', (req, res) => {
    const session = sessions.get(req.params.code);
    if (!session) {
      return res.status(404).json({ error: 'Session bulunamadı.' });
    }

    session.isEvaluationFinalized = true;
    return res.json({
      message: 'Değerlendirme onaylandı ve kesinleştirildi.',
      session,
      selectedCount: session.questions.filter((q) => q.selectionStatus === 'Seçildi').length,
    });
  });

  // 8. Start Quiz
  app.post('/api/sessions/:code/quiz/start', (req, res) => {
    const session = sessions.get(req.params.code);
    if (!session) {
      return res.status(404).json({ error: 'Session bulunamadı.' });
    }

    const selectedQuestions = session.questions.filter((q) => q.selectionStatus === 'Seçildi');
    if (selectedQuestions.length === 0) {
      return res.status(400).json({ error: 'Quiz başlatmak için en az 1 sorunun "Seçildi" olarak işaretlenmiş olması gerekir.' });
    }

    session.status = 'quiz_active';
    session.quizState = {
      activeQuestionIndex: 0,
      showAnswer: false,
      isAcceptingAnswers: true,
      startedAt: new Date().toISOString(),
    };

    return res.json(session);
  });

  // 9. Quiz control (Next, Prev, Show Answer, Finish)
  app.post('/api/sessions/:code/quiz/control', (req, res) => {
    const session = sessions.get(req.params.code);
    if (!session) {
      return res.status(404).json({ error: 'Session bulunamadı.' });
    }

    const selectedQuestions = session.questions.filter((q) => q.selectionStatus === 'Seçildi');
    const { action, index } = req.body;

    if (action === 'next') {
      if (session.quizState.activeQuestionIndex < selectedQuestions.length - 1) {
        session.quizState.activeQuestionIndex += 1;
        session.quizState.showAnswer = false;
        session.quizState.isAcceptingAnswers = true;
      }
    } else if (action === 'prev') {
      if (session.quizState.activeQuestionIndex > 0) {
        session.quizState.activeQuestionIndex -= 1;
        session.quizState.showAnswer = false;
        session.quizState.isAcceptingAnswers = true;
      }
    } else if (action === 'jump' && typeof index === 'number') {
      if (index >= 0 && index < selectedQuestions.length) {
        session.quizState.activeQuestionIndex = index;
        session.quizState.showAnswer = false;
        session.quizState.isAcceptingAnswers = true;
      }
    } else if (action === 'toggle_answer') {
      session.quizState.showAnswer = !session.quizState.showAnswer;
    } else if (action === 'toggle_accepting') {
      session.quizState.isAcceptingAnswers = !session.quizState.isAcceptingAnswers;
    } else if (action === 'finish') {
      session.status = 'finished';
      session.quizState.isAcceptingAnswers = false;
      session.quizState.showAnswer = true;
    }

    return res.json(session);
  });

  // 10. Student submits answer for active question
  app.post('/api/sessions/:code/quiz/answer', (req, res) => {
    const session = sessions.get(req.params.code);
    if (!session) {
      return res.status(404).json({ error: 'Session bulunamadı.' });
    }

    if (session.status !== 'quiz_active') {
      return res.status(400).json({ error: 'Quiz şu anda aktif değil.' });
    }

    if (!session.quizState.isAcceptingAnswers) {
      return res.status(400).json({ error: 'Bu soru için cevap alımı durdurulmuştur.' });
    }

    const { studentNo, studentName, answer } = req.body;
    const cleanStudentNo = (studentNo || '').toString().trim();
    if (!/^\d{9}$/.test(cleanStudentNo)) {
      return res.status(400).json({ error: 'Öğrenci numarası sadece rakamlardan oluşan 9 haneli bir numara olmalıdır.' });
    }
    const cleanStudentName = (studentName || '').toString().trim();
    if (!cleanStudentName) {
      return res.status(400).json({ error: 'Öğrenci Ad Soyad alanı zorunludur.' });
    }
    if (!answer) {
      return res.status(400).json({ error: 'Verilen cevap zorunludur.' });
    }

    const selectedQuestions = session.questions.filter((q) => q.selectionStatus === 'Seçildi');
    const currentQ = selectedQuestions[session.quizState.activeQuestionIndex];
    if (!currentQ) {
      return res.status(400).json({ error: 'Aktif soru bulunamadı.' });
    }

    const cleanAnswer = answer.toString().trim().toUpperCase();
    const isCorrect = cleanAnswer === currentQ.answer.toUpperCase();
    const timestampStr = new Date().toLocaleString('tr-TR', {
      timeZone: 'Europe/Istanbul',
      dateStyle: 'short',
      timeStyle: 'medium',
    });

    // Check student answer attempt limits
    const maxAttempts =
      typeof session.maxAnswerAttemptsPerQuestion === 'number' && session.maxAnswerAttemptsPerQuestion > 0
        ? session.maxAnswerAttemptsPerQuestion
        : 1;

    // Count answers already recorded for this student on this specific question
    const studentPreviousAnswers = session.answers.filter(
      (a) => a.questionId === currentQ.id && a.studentNo === cleanStudentNo
    );

    if (studentPreviousAnswers.length >= maxAttempts) {
      return res.status(403).json({
        error: `Bu soru için belirlenen cevap verme hakkınızı (${maxAttempts} hak) doldurdunuz. Ek cevap kabul edilmez ve Google Sheet'e kaydedilmez.`,
        attemptsUsed: studentPreviousAnswers.length,
        maxAttempts,
      });
    }

    const quizAnswer: QuizAnswer = {
      id: `ans-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      sessionCode: session.code,
      courseName: session.courseName,
      topic: currentQ.topic,
      questionId: currentQ.id,
      questionIndex: session.quizState.activeQuestionIndex,
      questionText: currentQ.question,
      studentNo: cleanStudentNo,
      studentName: cleanStudentName,
      givenAnswer: cleanAnswer,
      correctAnswer: currentQ.answer,
      isCorrect,
      statusText: isCorrect ? 'Doğru' : 'Yanlış',
      timestamp: timestampStr,
    };

    session.answers.push(quizAnswer);

    return res.status(201).json({
      ...quizAnswer,
      attemptsUsed: studentPreviousAnswers.length + 1,
      maxAttempts,
      remainingAttempts: Math.max(0, maxAttempts - (studentPreviousAnswers.length + 1)),
    });
  });

  // 11. Live quiz state & stats for active question
  app.get('/api/sessions/:code/quiz/stats', (req, res) => {
    const session = sessions.get(req.params.code);
    if (!session) {
      return res.status(404).json({ error: 'Session bulunamadı.' });
    }

    const selectedQuestions = session.questions.filter((q) => q.selectionStatus === 'Seçildi');
    const currentIndex = session.quizState.activeQuestionIndex;
    const currentQ = selectedQuestions[currentIndex];

    if (!currentQ) {
      return res.json({
        totalSelected: selectedQuestions.length,
        currentIndex,
        currentQ: null,
        stats: { total: 0, A: 0, B: 0, C: 0, D: 0, E: 0 },
        answers: [],
      });
    }

    const currentAnswers = session.answers.filter((a) => a.questionId === currentQ.id);
    const distribution: Record<string, number> = { A: 0, B: 0, C: 0, D: 0, E: 0 };
    for (const a of currentAnswers) {
      if (distribution[a.givenAnswer] !== undefined) {
        distribution[a.givenAnswer]++;
      }
    }

    return res.json({
      totalSelected: selectedQuestions.length,
      currentIndex,
      currentQ,
      quizState: session.quizState,
      status: session.status,
      stats: {
        total: currentAnswers.length,
        ...distribution,
      },
      answers: currentAnswers,
      allAnswers: session.answers,
    });
  });

  // 12. Generate comprehensive Quiz Analysis Report using Gemini AI
  app.post('/api/sessions/:code/generate-quiz-report', aiRateLimiter, async (req, res) => {
    const code = req.params.code;
    const session = sessions.get(code);
    if (!session) {
      return res.status(404).json({ error: 'Oturum bulunamadı.' });
    }

    if (activeAiOperations.has(`report_${code}`)) {
      return res.status(429).json({ error: 'Rapor üretme işlemi zaten devam etmektedir. Lütfen bekleyiniz.' });
    }

    const lastTime = lastAiOperationTime.get(`report_${code}`) || 0;
    if (Date.now() - lastTime < 10000) {
      const waitSec = Math.ceil((10000 - (Date.now() - lastTime)) / 1000);
      return res.status(429).json({ error: `Rapor talepleri arasında en az 10 saniye beklenmelidir. Kalan süre: ${waitSec} sn.` });
    }

    const selectedQuestions = session.questions.filter((q) => q.selectionStatus === 'Seçildi');
    if (selectedQuestions.length === 0) {
      return res.status(400).json({ error: 'Rapor oluşturmak için en az 1 seçilmiş quiz sorusu bulunmalıdır.' });
    }

    if (session.answers.length === 0) {
      return res.status(400).json({
        error: 'Henüz öğrenci cevabı bulunmuyor. Öğrenciler quiz sorularını yanıtladıktan sonra analiz raporu oluşturabilirsiniz.',
      });
    }

    activeAiOperations.add(`report_${code}`);
    lastAiOperationTime.set(`report_${code}`, Date.now());

    // Hard metrics: Students
    const studentMap = new Map<string, { studentNo: string; studentName: string; total: number; correct: number }>();
    for (const a of session.answers) {
      const existing = studentMap.get(a.studentNo) || {
        studentNo: a.studentNo,
        studentName: a.studentName || 'Öğrenci',
        total: 0,
        correct: 0,
      };
      if (a.studentName && existing.studentName === 'Öğrenci') {
        existing.studentName = a.studentName;
      }
      existing.total += 1;
      if (a.isCorrect) existing.correct += 1;
      studentMap.set(a.studentNo, existing);
    }
    const studentList = Array.from(studentMap.values()).map((s) => ({
      ...s,
      scorePercent: s.total > 0 ? Math.round((s.correct / s.total) * 100) : 0,
    }));
    const totalStudents = studentList.length;
    const classAvg = totalStudents > 0
      ? Math.round(studentList.reduce((acc, s) => acc + s.scorePercent, 0) / totalStudents)
      : 0;

    // Hard metrics: Topics
    const topicMap = new Map<string, { topic: string; totalAnswers: number; correctAnswers: number; questionsCount: number }>();
    for (const q of selectedQuestions) {
      const t = q.topic || 'Genel Konu';
      const cur = topicMap.get(t) || { topic: t, totalAnswers: 0, correctAnswers: 0, questionsCount: 0 };
      cur.questionsCount += 1;
      const qAnswers = session.answers.filter((a) => a.questionId === q.id);
      cur.totalAnswers += qAnswers.length;
      cur.correctAnswers += qAnswers.filter((a) => a.isCorrect).length;
      topicMap.set(t, cur);
    }
    const topicStats = Array.from(topicMap.values()).map((t) => ({
      ...t,
      successRate: t.totalAnswers > 0 ? Math.round((t.correctAnswers / t.totalAnswers) * 100) : 0,
    }));

    // Hard metrics: Questions
    const questionStats = selectedQuestions.map((q, idx) => {
      const qAnswers = session.answers.filter((a) => a.questionId === q.id);
      const counts: Record<string, number> = { A: 0, B: 0, C: 0, D: 0, E: 0 };
      for (const a of qAnswers) {
        if (counts[a.givenAnswer] !== undefined) counts[a.givenAnswer]++;
      }
      const correctCount = qAnswers.filter((a) => a.isCorrect).length;
      const successRate = qAnswers.length > 0 ? Math.round((correctCount / qAnswers.length) * 100) : 0;
      let topWrong = '';
      let topWrongCount = 0;
      for (const opt of ['A', 'B', 'C', 'D', 'E']) {
        if (opt !== q.answer && counts[opt] > topWrongCount) {
          topWrong = opt;
          topWrongCount = counts[opt];
        }
      }
      return {
        id: q.id,
        index: idx + 1,
        question: q.question,
        topic: q.topic,
        correctAnswer: q.answer,
        totalAnswers: qAnswers.length,
        correctCount,
        successRate,
        counts,
        topWrongOption: topWrong || undefined,
        topWrongCount,
        topWrongPercentage: qAnswers.length > 0 ? Math.round((topWrongCount / qAnswers.length) * 100) : 0,
      };
    });

    try {
      const prompt = `Aşağıda "${session.courseName}" dersinde sınıfta uygulanan canlı quizin sonuç verileri yer almaktadır.
Sen kıdemli bir eğitim bilimci, ölçme-değerlendirme ve pedagoji uzmanısın.
Bu verilere dayanarak öğretmen için derinlemesine, somut verilere dayanan, hem güçlü yönleri hem kavram yanılgılarını ortaya koyan profesyonel bir "Quiz Sonuç Analiz Raporu" oluştur.

VERİ ÖZETİ:
- Ders Adı: ${session.courseName}
- Katılan Toplam Öğrenci Sayısı: ${totalStudents}
- Toplam Cevaplanan Soru Sayısı: ${session.answers.length}
- Sınıf Başarı Ortalaması: %${classAvg}

KONU BAZLI PERFORMANS:
${JSON.stringify(topicStats, null, 2)}

SORU BAZLI DETAYLAR VE ŞIK DAĞILIMLARI:
${JSON.stringify(questionStats, null, 2)}

ÖĞRENCİ PERFORMANS DAĞILIMI:
${JSON.stringify(studentList, null, 2)}

RAPOR GEREKSİNİMLERİ:
1. "executiveSummary": Genel sınıf pedagojik başarı ve kavrama özetini içeren profesyonel bir paragraf.
2. "topicInsights": Her konu için nesnel bir pedagojik değerlendirme ("assessment"), durum ("mastered" [%75+], "developing" [%50-75] veya "critical" [<%50]) ve öğretmene özel bir tavsiye ("recommendation").
3. "distractorAnalysis": Özellikle başarı oranı düşük olan veya belirgin bir yanlış şıkkın yüksek oranda seçildiği sorular için öğrencilerin neden o yanlış şıkka yöneldiğine dair kavram yanılgısı analizi ("misconceptionExplanation").
4. "studentGroupings":
   - "highAchieversSummary": Başarılı öğrencilerin performansı ve ileri düzey öneriler.
   - "needsSupportSummary": Desteğe ihtiyaç duyan öğrencilerin eksiklikleri ve telafi önerileri.
   - "highAchieversCount": Başarılı öğrenci sayısı.
   - "needsSupportCount": Destek ihtiyacı olan öğrenci sayısı.
5. "actionableRecommendations": Öğretmenin bir sonraki dersinde hemen uygulayabileceği 3 ila 5 adet somut, madde madde pedagojik eylem adımı.
6. "strengths": Sınıfın en iyi olduğu 2-4 somut konu/kazanım maddesi.
7. "areasToImprove": Sınıfın en çok zorlandığı 2-4 kritik gelişim alanı.`;

      let generatedReport: QuizReportAnalysis | null = null;
      const modelsToTry = ['gemini-3.8-flash', 'gemini-flash-latest', 'gemini-3.1-flash-lite'];

      for (const modelName of modelsToTry) {
        try {
          const response = await ai.models.generateContent({
            model: modelName,
            contents: prompt,
            config: {
              responseMimeType: 'application/json',
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  executiveSummary: { type: Type.STRING },
                  topicInsights: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        topic: { type: Type.STRING },
                        assessment: { type: Type.STRING },
                        status: { type: Type.STRING, enum: ['mastered', 'developing', 'critical'] },
                        recommendation: { type: Type.STRING },
                      },
                      required: ['topic', 'assessment', 'status', 'recommendation'],
                    },
                  },
                  distractorAnalysis: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        questionId: { type: Type.STRING },
                        questionText: { type: Type.STRING },
                        topic: { type: Type.STRING },
                        correctAnswer: { type: Type.STRING },
                        topWrongOption: { type: Type.STRING },
                        misconceptionExplanation: { type: Type.STRING },
                      },
                      required: ['questionId', 'questionText', 'topic', 'correctAnswer', 'misconceptionExplanation'],
                    },
                  },
                  studentGroupings: {
                    type: Type.OBJECT,
                    properties: {
                      highAchieversSummary: { type: Type.STRING },
                      needsSupportSummary: { type: Type.STRING },
                      highAchieversCount: { type: Type.INTEGER },
                      needsSupportCount: { type: Type.INTEGER },
                    },
                    required: ['highAchieversSummary', 'needsSupportSummary', 'highAchieversCount', 'needsSupportCount'],
                  },
                  actionableRecommendations: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                  },
                  strengths: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                  },
                  areasToImprove: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                  },
                },
                required: [
                  'executiveSummary',
                  'topicInsights',
                  'distractorAnalysis',
                  'studentGroupings',
                  'actionableRecommendations',
                  'strengths',
                  'areasToImprove',
                ],
              },
            },
          });

          if (response.text) {
            const parsed = JSON.parse(response.text);
            generatedReport = {
              generatedAt: new Date().toISOString(),
              classAverageScore: classAvg,
              totalStudents,
              totalAnswers: session.answers.length,
              executiveSummary: parsed.executiveSummary || 'Analiz raporu oluşturuldu.',
              topicInsights: (parsed.topicInsights || []).map((ti: any) => {
                const ts = topicStats.find((s) => s.topic === ti.topic);
                return {
                  ...ti,
                  successRate: ts ? ts.successRate : 0,
                  totalAnswers: ts ? ts.totalAnswers : 0,
                  correctAnswers: ts ? ts.correctAnswers : 0,
                };
              }),
              distractorAnalysis: parsed.distractorAnalysis || [],
              studentGroupings: parsed.studentGroupings || {
                highAchieversSummary: '',
                needsSupportSummary: '',
                highAchieversCount: 0,
                needsSupportCount: 0,
              },
              actionableRecommendations: parsed.actionableRecommendations || [],
              strengths: parsed.strengths || [],
              areasToImprove: parsed.areasToImprove || [],
            };
            break;
          }
        } catch (modelErr: unknown) {
          const errMsg = modelErr instanceof Error ? modelErr.message : String(modelErr);
          console.warn(`Model ${modelName} report generation failed:`, errMsg);
          if (
            errMsg.includes('429') ||
            errMsg.includes('RESOURCE_EXHAUSTED') ||
            errMsg.includes('403') ||
            errMsg.includes('PERMISSION_DENIED') ||
            errMsg.includes('suspended') ||
            errMsg.includes('API key')
          ) {
            console.warn('Google Cloud quota or permission issue for report. Using local pedagogical report immediately.');
            break;
          }
          await new Promise((r) => setTimeout(r, 600));
        }
      }

      if (!generatedReport) {
        // Fallback programmatic report if offline or AI call fails
        generatedReport = {
          generatedAt: new Date().toISOString(),
          classAverageScore: classAvg,
          totalStudents,
          totalAnswers: session.answers.length,
          executiveSummary: `${session.courseName} dersi canlı quizinde toplam ${totalStudents} öğrenci katılmış ve sınıf ortalaması %${classAvg} olarak gerçekleşmiştir.`,
          topicInsights: topicStats.map((t) => ({
            topic: t.topic,
            successRate: t.successRate,
            totalAnswers: t.totalAnswers,
            correctAnswers: t.correctAnswers,
            status: (t.successRate >= 75 ? 'mastered' : t.successRate >= 50 ? 'developing' : 'critical') as 'mastered' | 'developing' | 'critical',
            assessment: `%${t.successRate} başarı oranı elde edildi (${t.correctAnswers}/${t.totalAnswers} doğru).`,
            recommendation: t.successRate < 60 ? 'Bu konunun temel kavramları tekrar edilmelidir.' : 'Konu başarıyla kavranmıştır.',
          })),
          distractorAnalysis: questionStats
            .filter((q) => q.topWrongOption && q.topWrongPercentage > 20)
            .map((q) => ({
              questionId: q.id,
              questionText: q.question,
              topic: q.topic,
              correctAnswer: q.correctAnswer,
              topWrongOption: q.topWrongOption,
              misconceptionExplanation: `Öğrencilerin %${q.topWrongPercentage}'i ${q.topWrongOption} seçeneğine yöneldi. Bu seçenekteki çeldirici kavram yanılgısı yaratmış olabilir.`,
            })),
          studentGroupings: {
            highAchieversSummary: `%75 üzeri başarı gösteren öğrenciler konuyu iyi kavramıştır.`,
            needsSupportSummary: `%50 altı puan alan öğrenciler için ek çalışma önerilir.`,
            highAchieversCount: studentList.filter((s) => s.scorePercent >= 75).length,
            needsSupportCount: studentList.filter((s) => s.scorePercent < 50).length,
          },
          actionableRecommendations: [
            'Başarı oranı %50 altında kalan konular için 10 dakikalık pekiştirme yapınız.',
            'En çok yanılgıya düşülen çeldirici seçenekleri sınıfta tartışmaya açınız.',
            'Yüksek başarı gösteren öğrencileri akran öğretimi için eşleştiriniz.',
          ],
          strengths: topicStats.filter((t) => t.successRate >= 70).map((t) => `${t.topic} (%${t.successRate} başarı)`),
          areasToImprove: topicStats.filter((t) => t.successRate < 60).map((t) => `${t.topic} (%${t.successRate} başarı)`),
        };
      }

      session.quizReport = generatedReport;
      return res.json({
        message: 'Quiz analiz raporu başarıyla oluşturuldu.',
        report: generatedReport,
        session,
      });
    } catch (err: unknown) {
      return res.status(500).json({
        error: 'Rapor oluşturulamadı: ' + (err instanceof Error ? err.message : String(err)),
      });
    } finally {
      activeAiOperations.delete(`report_${code}`);
    }
  });

  const httpServer = http.createServer(app);

  // Mount Vite or static build
  if (process.env.NODE_ENV !== 'production') {
    let viteMiddleware: any = null;
    const vitePromise = createViteServer({
      server: {
        middlewareMode: true,
        hmr: { server: httpServer },
      },
      appType: 'spa',
    }).then((vite) => {
      viteMiddleware = vite.middlewares;
      return vite;
    }).catch((err) => {
      console.error('Failed to create Vite server:', err);
    });

    app.use(async (req, res, next) => {
      if (req.path.startsWith('/api')) {
        return next();
      }
      if (!viteMiddleware && vitePromise) {
        await vitePromise;
      }
      if (viteMiddleware) {
        return viteMiddleware(req, res, next);
      }
      next();
    });
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  httpServer.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`Server listening on port ${PORT}`);
  });
}

startServer();
