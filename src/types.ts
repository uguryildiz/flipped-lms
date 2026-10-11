export interface AikenQuestion {
  id: string;
  courseName: string;       // Ders Adı
  studentNo: string;        // Öğrenci No
  studentName?: string;
  topic: string;            // Konu
  question: string;         // Soru
  optionA: string;          // Seçenek A
  optionB: string;          // Seçenek B
  optionC: string;          // Seçenek C
  optionD: string;          // Seçenek D
  optionE: string;          // Seçenek E
  answer: string;           // Cevap (A, B, C, D, E)
  selectionStatus: 'Seçildi' | 'Seçilmedi' | 'Beklemede'; // Seçilme Durumu
  analysisScore: number;    // Analiz Skoru (0-100)
  analysisFeedback?: string;// Gemini gerekçesi
  sessionCode: string;      // Session Kodu
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
  givenAnswer: string;      // A, B, C, D, E
  correctAnswer: string;
  isCorrect: boolean;
  statusText: 'Doğru' | 'Yanlış';
  timestamp: string;        // Zaman Damgası
  syncedToSheets?: boolean;
}

export interface TopicConfig {
  scoreThreshold: number; // Analiz Skoru Eşiği (0-100)
  topCount: number;       // Bu konudan seçilecek en yüksek puanlı soru adedi
  selectionMode: 'threshold' | 'top_count' | 'threshold_and_top_count'; // Seçim modu: Eşik, En yüksek N soru veya Eşik VE En İyi N Soru
  maxQuestionsLimit?: number; // Öğrenci başına bu konudan sorulabilecek maksimum soru adedi sınırı
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
  code: string;             // 5 haneli kod
  courseName: string;       // Ders Adı
  topics: string[];         // Günün konu başlıkları
  scoreThreshold: number;   // Genel Analiz Skoru Eşiği (örn 70)
  topCount?: number;        // Genel En İyi Skorlu Soru Adedi (örn 2 veya 3)
  selectionMode?: 'threshold' | 'top_count' | 'threshold_and_top_count'; // Genel seçim modu
  maxAnswerAttemptsPerQuestion?: number; // Soru başına cevap hakkı sınırı (varsayılan: 1)
  maxQuestionsPerStudent?: number;       // Öğrenci başına genel soru yükleme sınırı (varsayılan: 1)
  maxQuestionsPerTopicPerStudent?: number; // Öğrencinin her konu başlığına sorabileceği soru sınırı (varsayılan: 1)
  maxTopicsPerStudent?: number;          // Öğrencinin soru gönderebileceği maksimum farklı konu adedi (0 veya undefined = tüm konular)
  topicConfigs?: Record<string, TopicConfig>; // Konu bazlı eşik ve seçim adetleri
  status: 'collecting' | 'analyzing' | 'selection_review' | 'quiz_active' | 'finished';
  createdAt: string;
  spreadsheetId?: string;
  spreadsheetUrl?: string;
  lastEvaluationCriteria?: string; // Öğretmenin ek prompt ve değerlendirme kriterleri
  isEvaluationFinalized?: boolean; // Öğretmen incelemeyi tamamlayıp onayladı mı?
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

// Type aliases for common interface names
export type Question = AikenQuestion;
export type Session = SessionInfo;
export type QuizResult = QuizAnswer;
