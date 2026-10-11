import React, { useState, useMemo } from 'react';
import {
  Trophy,
  BarChart3,
  Sparkles,
  RefreshCw,
  Printer,
  Download,
  CheckCircle2,
  AlertCircle,
  BookOpen,
  Users,
  Search,
  Check,
  X,
  ChevronDown,
  ChevronUp,
  FileSpreadsheet,
  ExternalLink,
  Target,
  Award,
  Lightbulb,
  ShieldAlert,
  Flame,
  Clock,
} from 'lucide-react';
import { SessionInfo, AikenQuestion, QuizAnswer, QuizReportAnalysis } from '../types';

interface QuizReportViewProps {
  session: SessionInfo;
  onRefreshReport: () => Promise<void>;
  isGeneratingReport: boolean;
  onSyncToSheet?: () => Promise<void>;
  isSyncingToSheet?: boolean;
  onStartNewSession?: () => void;
}

export const QuizReportView: React.FC<QuizReportViewProps> = ({
  session,
  onRefreshReport,
  isGeneratingReport,
  onSyncToSheet,
  isSyncingToSheet = false,
  onStartNewSession,
}) => {
  const [activeTab, setActiveTab] = useState<'ai' | 'topics' | 'questions' | 'students'>('ai');
  const [studentSearch, setStudentSearch] = useState('');
  const [expandedStudentNo, setExpandedStudentNo] = useState<string | null>(null);

  // Selected questions used in the live quiz
  const quizQuestions = useMemo(() => {
    return session.questions.filter((q) => q.selectionStatus === 'Seçildi');
  }, [session.questions]);

  // Answers list
  const answers = session.answers || [];

  // Compute Student-based Statistics
  const studentStats = useMemo(() => {
    const map = new Map<
      string,
      {
        studentNo: string;
        studentName: string;
        total: number;
        correct: number;
        answersList: QuizAnswer[];
      }
    >();

    for (const a of answers) {
      const sNo = a.studentNo.trim();
      const existing = map.get(sNo) || {
        studentNo: sNo,
        studentName: a.studentName || 'Öğrenci',
        total: 0,
        correct: 0,
        answersList: [],
      };
      if (a.studentName && (!existing.studentName || existing.studentName === 'Öğrenci')) {
        existing.studentName = a.studentName.trim();
      }
      existing.total += 1;
      if (a.isCorrect) existing.correct += 1;
      existing.answersList.push(a);
      map.set(sNo, existing);
    }

    const list = Array.from(map.values()).map((s) => {
      const pct = s.total > 0 ? Math.round((s.correct / s.total) * 100) : 0;
      return {
        ...s,
        scorePercent: pct,
        wrongCount: s.total - s.correct,
      };
    });

    // Sort descending by scorePercent, then by correct count
    list.sort((a, b) => {
      if (b.scorePercent !== a.scorePercent) {
        return b.scorePercent - a.scorePercent;
      }
      return b.correct - a.correct;
    });

    return list;
  }, [answers]);

  // Compute Topic-based Statistics
  const topicStats = useMemo(() => {
    const map = new Map<
      string,
      {
        topic: string;
        questionsCount: number;
        totalAnswers: number;
        correctAnswers: number;
      }
    >();

    for (const q of quizQuestions) {
      const t = q.topic.trim();
      const existing = map.get(t) || {
        topic: t,
        questionsCount: 0,
        totalAnswers: 0,
        correctAnswers: 0,
      };
      existing.questionsCount += 1;
      const qAnswers = answers.filter((a) => a.questionId === q.id);
      existing.totalAnswers += qAnswers.length;
      existing.correctAnswers += qAnswers.filter((a) => a.isCorrect).length;
      map.set(t, existing);
    }

    return Array.from(map.values()).map((t) => {
      const rate = t.totalAnswers > 0 ? Math.round((t.correctAnswers / t.totalAnswers) * 100) : 0;
      return {
        ...t,
        successRate: rate,
        status: (rate >= 75 ? 'mastered' : rate >= 50 ? 'developing' : 'critical') as
          | 'mastered'
          | 'developing'
          | 'critical',
      };
    });
  }, [quizQuestions, answers]);

  // Compute Question-based Statistics
  const questionStats = useMemo(() => {
    return quizQuestions.map((q, idx) => {
      const qAnswers = answers.filter((a) => a.questionId === q.id);
      const counts: Record<string, number> = { A: 0, B: 0, C: 0, D: 0, E: 0 };
      for (const a of qAnswers) {
        if (counts[a.givenAnswer] !== undefined) counts[a.givenAnswer]++;
      }
      const correctCount = qAnswers.filter((a) => a.isCorrect).length;
      const rate = qAnswers.length > 0 ? Math.round((correctCount / qAnswers.length) * 100) : 0;

      // Find top wrong option
      let topWrong = '';
      let topWrongCount = 0;
      for (const opt of ['A', 'B', 'C', 'D', 'E']) {
        if (opt !== q.answer && counts[opt] > topWrongCount) {
          topWrong = opt;
          topWrongCount = counts[opt];
        }
      }

      const difficulty = rate >= 70 ? 'Kolay' : rate >= 40 ? 'Orta' : 'Zor';

      return {
        id: q.id,
        index: idx + 1,
        question: q.question,
        topic: q.topic,
        studentNo: q.studentNo,
        studentName: q.studentName,
        correctAnswer: q.answer,
        optionA: q.optionA,
        optionB: q.optionB,
        optionC: q.optionC,
        optionD: q.optionD,
        optionE: q.optionE,
        totalAnswers: qAnswers.length,
        correctCount,
        successRate: rate,
        counts,
        topWrongOption: topWrong || undefined,
        topWrongCount,
        topWrongPercentage: qAnswers.length > 0 ? Math.round((topWrongCount / qAnswers.length) * 100) : 0,
        difficulty,
      };
    });
  }, [quizQuestions, answers]);

  // Aggregate KPI numbers
  const totalStudents = studentStats.length;
  const classAverage =
    totalStudents > 0
      ? Math.round(studentStats.reduce((acc, s) => acc + s.scorePercent, 0) / totalStudents)
      : 0;

  const bestTopic = useMemo(() => {
    if (topicStats.length === 0) return null;
    return [...topicStats].sort((a, b) => b.successRate - a.successRate)[0];
  }, [topicStats]);

  const strugglingTopic = useMemo(() => {
    if (topicStats.length === 0) return null;
    return [...topicStats].sort((a, b) => a.successRate - b.successRate)[0];
  }, [topicStats]);

  // Filtered Students
  const filteredStudents = useMemo(() => {
    if (!studentSearch.trim()) return studentStats;
    const term = studentSearch.trim().toLowerCase();
    return studentStats.filter(
      (s) => s.studentNo.includes(term) || s.studentName.toLowerCase().includes(term)
    );
  }, [studentStats, studentSearch]);

  // Export full report to CSV
  const handleExportCSV = () => {
    let csv = `\uFEFF`; // UTF-8 BOM for Excel Turkish character compatibility
    csv += `QUIZ SONUÇ VE ANALİZ RAPORU\n`;
    csv += `Ders: ${session.courseName};Oturum Kodu: ${session.code};Tarih: ${new Date().toLocaleDateString('tr-TR')}\n`;
    csv += `Katılan Öğrenci: ${totalStudents};Toplam Cevap: ${answers.length};Sınıf Ortalaması: %${classAverage}\n\n`;

    // 1. ÖĞRENCİ BAŞARI SIRALAMASI
    csv += `1. ÖĞRENCİ BAŞARI SIRALAMASI\n`;
    csv += `Sıra;Öğrenci No;Ad Soyad;Cevaplanan Soru;Doğru Sayısı;Yanlış Sayısı;Başarı Yüzdesi (%)\n`;
    studentStats.forEach((s, idx) => {
      csv += `${idx + 1};${s.studentNo};"${s.studentName}";${s.total};${s.correct};${s.wrongCount};%${s.scorePercent}\n`;
    });
    csv += `\n`;

    // 2. KONU BAZLI ANALİZ
    csv += `2. KONU BAZLI PERFORMANS\n`;
    csv += `Konu;Soru Sayısı;Toplam Cevap;Doğru Cevap;Başarı Yüzdesi (%)\n`;
    topicStats.forEach((t) => {
      csv += `"${t.topic}";${t.questionsCount};${t.totalAnswers};${t.correctAnswers};%${t.successRate}\n`;
    });
    csv += `\n`;

    // 3. SORU BAZLI ANALİZ
    csv += `3. SORU BAZLI ANALİZ VE ŞIK DAĞILIMI\n`;
    csv += `Soru No;Konu;Doğru Cevap;Başarı (%);Zorluk;A;B;C;D;E;Soru Metni\n`;
    questionStats.forEach((q) => {
      csv += `${q.index};"${q.topic}";${q.correctAnswer};%${q.successRate};${q.difficulty};${q.counts.A};${q.counts.B};${q.counts.C};${q.counts.D};${q.counts.E};"${q.question.replace(/"/g, '""')}"\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Quiz_Raporu_${session.courseName.replace(/\s+/g, '_')}_${session.code}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const report = session.quizReport;

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* REPORT HEADER & ACTION BAR */}
      <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-sm border border-slate-200 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-3 py-1 bg-indigo-100 text-indigo-800 text-xs font-black uppercase rounded-lg tracking-wider">
              Quiz Analiz Raporu
            </span>
            <span className="px-2.5 py-1 bg-slate-100 text-slate-700 font-mono text-xs font-bold rounded-lg">
              Kod: {session.code}
            </span>
            {report && (
              <span className="px-2.5 py-1 bg-purple-100 text-purple-800 text-xs font-bold rounded-lg flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-purple-600" />
                Gemini Analizi Hazır
              </span>
            )}
          </div>
          <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
            {session.courseName}
          </h2>
          <p className="text-xs sm:text-sm text-slate-500">
            Soru, Konu ve Öğrenci bazlı görsel başarı grafikleri ve Google Gemini pedagojik değerlendirmeleri.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2.5 flex-wrap self-stretch lg:self-auto justify-start lg:justify-end">
          <button
            type="button"
            onClick={onRefreshReport}
            disabled={isGeneratingReport || answers.length === 0}
            className="px-4 py-2.5 bg-linear-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-xl text-xs font-bold shadow-md transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
            title="Google Gemini ile tüm verileri pedagojik olarak yorumlat"
          >
            {isGeneratingReport ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4" />
            )}
            <span>{report ? 'Yapay Zeka Analizini Yenile' : 'Gemini ile Rapor Oluştur'}</span>
          </button>

          <button
            type="button"
            onClick={() => window.print()}
            className="px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer"
            title="Yazdır veya PDF olarak kaydet"
          >
            <Printer className="w-4 h-4" />
            <span className="hidden sm:inline">Yazdır / PDF</span>
          </button>

          <button
            type="button"
            onClick={handleExportCSV}
            disabled={answers.length === 0}
            className="px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            title="Verileri CSV (Excel) dosyası olarak indir"
          >
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">CSV İndir</span>
          </button>

          {session.spreadsheetUrl ? (
            <a
              href={session.spreadsheetUrl}
              target="_blank"
              rel="noreferrer"
              className="px-3.5 py-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5"
            >
              <ExternalLink className="w-4 h-4 text-emerald-600" />
              <span className="hidden sm:inline">Google Sheet</span>
            </a>
          ) : onSyncToSheet ? (
            <button
              type="button"
              onClick={onSyncToSheet}
              disabled={isSyncingToSheet || answers.length === 0}
              className="px-3.5 py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              {isSyncingToSheet ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <FileSpreadsheet className="w-4 h-4" />
              )}
              <span>Sheet'e Aktar</span>
            </button>
          ) : null}

          {onStartNewSession && (
            <button
              type="button"
              onClick={onStartNewSession}
              className="px-3.5 py-2.5 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold transition-colors"
            >
              Yeni Oturum
            </button>
          )}
        </div>
      </div>

      {/* KPI METRIC CARDS */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Class Average Score */}
        <div className="bg-white rounded-3xl p-5 shadow-xs border border-slate-200 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Sınıf Başarı Ortalaması
            </span>
            <Target className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="flex items-baseline gap-2 pt-1">
            <span
              className={`text-3xl font-black font-mono ${
                classAverage >= 75
                  ? 'text-emerald-600'
                  : classAverage >= 50
                  ? 'text-amber-600'
                  : 'text-rose-600'
              }`}
            >
              %{classAverage}
            </span>
            <span className="text-xs font-bold text-slate-400">
              {classAverage >= 75 ? 'Başarılı' : classAverage >= 50 ? 'Geliştirilmeli' : 'Kritik'}
            </span>
          </div>
          <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden mt-2">
            <div
              className={`h-full rounded-full transition-all duration-700 ${
                classAverage >= 75
                  ? 'bg-emerald-500'
                  : classAverage >= 50
                  ? 'bg-amber-500'
                  : 'bg-rose-500'
              }`}
              style={{ width: `${Math.min(100, classAverage)}%` }}
            />
          </div>
        </div>

        {/* Participating Students */}
        <div className="bg-white rounded-3xl p-5 shadow-xs border border-slate-200 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Katılan Öğrenci
            </span>
            <Users className="w-4 h-4 text-purple-600" />
          </div>
          <div className="pt-1">
            <span className="text-3xl font-black font-mono text-slate-900">{totalStudents}</span>
            <span className="text-xs text-slate-500 ml-1.5 font-medium">Öğrenci</span>
          </div>
          <p className="text-[11px] text-slate-400 pt-1">
            Toplam {answers.length} cevap kaydedildi
          </p>
        </div>

        {/* Best Topic */}
        <div className="bg-white rounded-3xl p-5 shadow-xs border border-slate-200 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-800">
              En Başarılı Konu
            </span>
            <Award className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="pt-1">
            <p className="text-sm font-bold text-slate-900 truncate" title={bestTopic?.topic || '-'}>
              {bestTopic ? bestTopic.topic : 'Henüz veri yok'}
            </p>
            {bestTopic && (
              <span className="text-xs font-mono font-bold text-emerald-700">
                %{bestTopic.successRate} Doğruluk
              </span>
            )}
          </div>
          <p className="text-[11px] text-slate-400">Kavranma düzeyi en yüksek ünite</p>
        </div>

        {/* Struggling Topic */}
        <div className="bg-white rounded-3xl p-5 shadow-xs border border-slate-200 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-amber-800">
              Pekiştirilecek Konu
            </span>
            <ShieldAlert className="w-4 h-4 text-amber-600" />
          </div>
          <div className="pt-1">
            <p
              className="text-sm font-bold text-slate-900 truncate"
              title={strugglingTopic?.topic || '-'}
            >
              {strugglingTopic ? strugglingTopic.topic : 'Henüz veri yok'}
            </p>
            {strugglingTopic && (
              <span
                className={`text-xs font-mono font-bold ${
                  strugglingTopic.successRate >= 50 ? 'text-amber-700' : 'text-rose-700'
                }`}
              >
                %{strugglingTopic.successRate} Doğruluk
              </span>
            )}
          </div>
          <p className="text-[11px] text-slate-400">Tekrar edilmesi önerilen alan</p>
        </div>
      </div>

      {/* REPORT TABS NAVIGATION */}
      <div className="bg-white rounded-2xl p-1.5 shadow-xs border border-slate-200 flex flex-wrap items-center gap-1">
        <button
          type="button"
          onClick={() => setActiveTab('ai')}
          className={`flex-1 min-w-[140px] py-2.5 px-4 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
            activeTab === 'ai'
              ? 'bg-linear-to-r from-purple-600 to-indigo-600 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
          }`}
        >
          <Sparkles className="w-4 h-4" />
          <span>Gemini Pedagojik Analizi</span>
          {report && <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('topics')}
          className={`flex-1 min-w-[140px] py-2.5 px-4 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
            activeTab === 'topics'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
          }`}
        >
          <BookOpen className="w-4 h-4" />
          <span>Konu Bazlı Analiz ({topicStats.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('questions')}
          className={`flex-1 min-w-[140px] py-2.5 px-4 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
            activeTab === 'questions'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
          }`}
        >
          <BarChart3 className="w-4 h-4" />
          <span>Soru Bazlı Analiz ({questionStats.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('students')}
          className={`flex-1 min-w-[140px] py-2.5 px-4 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
            activeTab === 'students'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Öğrenci Başarı Tablosu ({totalStudents})</span>
        </button>
      </div>

      {/* TAB CONTENT 1: GEMINI AI PEDAGOGICAL REPORT */}
      {activeTab === 'ai' && (
        <div className="space-y-6">
          {!report ? (
            <div className="bg-linear-to-br from-purple-50 via-indigo-50/50 to-white rounded-3xl p-8 sm:p-12 border border-purple-200/80 text-center space-y-4 shadow-sm">
              <div className="w-16 h-16 rounded-2xl bg-purple-600 text-white flex items-center justify-center mx-auto shadow-md">
                <Sparkles className="w-8 h-8" />
              </div>
              <div className="max-w-md mx-auto space-y-1">
                <h3 className="text-xl font-bold text-slate-900">
                  Gemini Pedagojik Raporu Henüz Oluşturulmadı
                </h3>
                <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                  Quiz tamamlandıktan sonra toplanan tüm cevapları, şık dağılımlarını ve öğrencilerin kavram yanılgılarını Google Gemini yapay zekasına yorumlatabilirsiniz.
                </p>
              </div>
              <button
                type="button"
                onClick={onRefreshReport}
                disabled={isGeneratingReport || answers.length === 0}
                className="inline-flex items-center gap-2 px-6 py-3.5 bg-linear-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-bold rounded-2xl shadow-lg transition-all cursor-pointer disabled:opacity-50"
              >
                {isGeneratingReport ? (
                  <RefreshCw className="w-5 h-5 animate-spin" />
                ) : (
                  <Sparkles className="w-5 h-5" />
                )}
                <span>Gemini ile Pedagojik Analiz Raporu Oluştur</span>
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Executive Summary Card */}
              <div className="bg-linear-to-br from-indigo-900 via-indigo-950 to-purple-950 rounded-3xl p-6 sm:p-8 text-white shadow-xl space-y-4">
                <div className="flex items-center justify-between border-b border-indigo-800/60 pb-4">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-purple-500/20 text-purple-300 flex items-center justify-center border border-purple-400/30">
                      <Sparkles className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="font-bold text-base sm:text-lg">Yönetici & Pedagoji Özeti</h4>
                      <p className="text-[11px] text-indigo-300 font-mono">
                        Oluşturulma: {new Date(report.generatedAt).toLocaleString('tr-TR')}
                      </p>
                    </div>
                  </div>
                  <span className="px-3 py-1 bg-white/10 text-white rounded-full text-xs font-mono font-bold">
                    Ortalama: %{report.classAverageScore}
                  </span>
                </div>
                <p className="text-sm sm:text-base leading-relaxed text-indigo-100 font-medium">
                  {report.executiveSummary}
                </p>
              </div>

              {/* Strengths & Areas to Improve Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Strengths */}
                <div className="bg-emerald-50/70 border border-emerald-200 rounded-3xl p-6 space-y-3">
                  <h4 className="text-sm font-bold text-emerald-950 flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                    <span>Sınıfın Güçlü Olduğu Alanlar</span>
                  </h4>
                  <ul className="space-y-2 text-xs sm:text-sm text-emerald-900">
                    {report.strengths.map((item, idx) => (
                      <li key={idx} className="flex items-start gap-2 bg-white/70 p-2.5 rounded-xl border border-emerald-100">
                        <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">
                          ✓
                        </span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Areas to Improve */}
                <div className="bg-amber-50/70 border border-amber-200 rounded-3xl p-6 space-y-3">
                  <h4 className="text-sm font-bold text-amber-950 flex items-center gap-2">
                    <AlertCircle className="w-5 h-5 text-amber-600" />
                    <span>Kritik Gelişim & Tekrar Alanları</span>
                  </h4>
                  <ul className="space-y-2 text-xs sm:text-sm text-amber-900">
                    {report.areasToImprove.map((item, idx) => (
                      <li key={idx} className="flex items-start gap-2 bg-white/70 p-2.5 rounded-xl border border-amber-100">
                        <span className="w-5 h-5 rounded-full bg-amber-100 text-amber-700 font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">
                          !
                        </span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Actionable Pedagogical Recommendations */}
              <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-sm border border-slate-200 space-y-4">
                <div className="flex items-center gap-2.5 border-b border-slate-100 pb-3">
                  <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center">
                    <Lightbulb className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-900 text-sm sm:text-base">
                      Öğretmene Tavsiyeler & Bir Sonraki Ders Aksiyon Planı
                    </h4>
                    <p className="text-xs text-slate-500">
                      Sınıfın quiz sonuçlarına göre uygulanabilecek somut pedagojik adımlar
                    </p>
                  </div>
                </div>

                <div className="space-y-2.5">
                  {report.actionableRecommendations.map((rec, idx) => (
                    <div
                      key={idx}
                      className="flex items-start gap-3 p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 hover:bg-slate-100/70 transition-colors"
                    >
                      <span className="w-6 h-6 rounded-lg bg-indigo-600 text-white font-bold font-mono text-xs flex items-center justify-center shrink-0 mt-0.5">
                        {idx + 1}
                      </span>
                      <p className="text-xs sm:text-sm text-slate-800 leading-relaxed font-medium">
                        {rec}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Distractor & Misconception Insights */}
              {report.distractorAnalysis && report.distractorAnalysis.length > 0 && (
                <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-sm border border-slate-200 space-y-4">
                  <div className="flex items-center gap-2.5 border-b border-slate-100 pb-3">
                    <div className="w-8 h-8 rounded-xl bg-rose-50 text-rose-700 flex items-center justify-center">
                      <Flame className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-900 text-sm sm:text-base">
                        Çeldirici ve Kavram Yanılgısı (Misconception) Tespiti
                      </h4>
                      <p className="text-xs text-slate-500">
                        Öğrencilerin doğru seçenek yerine en çok düştüğü yanılgıların analizi
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {report.distractorAnalysis.map((item, idx) => (
                      <div
                        key={idx}
                        className="p-4 rounded-2xl bg-rose-50/40 border border-rose-200 space-y-2.5"
                      >
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold text-rose-900 px-2 py-0.5 bg-rose-100 rounded-md">
                            {item.topic}
                          </span>
                          <span className="font-mono text-slate-500">
                            Doğru Şık: <strong>{item.correctAnswer}</strong>
                          </span>
                        </div>
                        <p className="text-xs text-slate-800 font-medium line-clamp-2">
                          "{item.questionText}"
                        </p>
                        {item.topWrongOption && (
                          <div className="text-[11px] font-bold text-rose-700 flex items-center gap-1">
                            <span>Sıklıkla Seçilen Yanlış Şık: {item.topWrongOption}</span>
                          </div>
                        )}
                        <p className="text-xs text-slate-600 bg-white p-2.5 rounded-xl border border-rose-100">
                          {item.misconceptionExplanation}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Student Groupings Summary */}
              {report.studentGroupings && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-5 rounded-3xl bg-indigo-50/60 border border-indigo-200 space-y-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-indigo-900">
                      İleri Düzey Öğrenciler ({report.studentGroupings.highAchieversCount} Kişi)
                    </span>
                    <p className="text-xs sm:text-sm text-slate-700 leading-relaxed">
                      {report.studentGroupings.highAchieversSummary}
                    </p>
                  </div>

                  <div className="p-5 rounded-3xl bg-amber-50/60 border border-amber-200 space-y-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-amber-900">
                      Destek & Telafi İhtiyacı ({report.studentGroupings.needsSupportCount} Kişi)
                    </span>
                    <p className="text-xs sm:text-sm text-slate-700 leading-relaxed">
                      {report.studentGroupings.needsSupportSummary}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* TAB CONTENT 2: TOPIC MASTERY VIEW */}
      {activeTab === 'topics' && (
        <div className="space-y-6">
          <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-sm border border-slate-200 space-y-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h4 className="font-bold text-slate-900 text-base">Konu Bazlı Başarı Dağılımı</h4>
                <p className="text-xs text-slate-500">
                  Her ders konusunun kavranma düzeyi, çözülen soru ve başarı yüzdeleri
                </p>
              </div>
              <span className="text-xs font-bold text-indigo-700 bg-indigo-50 px-3 py-1 rounded-lg">
                Toplam {topicStats.length} Konu
              </span>
            </div>

            <div className="space-y-5">
              {topicStats.map((topicItem, idx) => {
                const aiInsight = report?.topicInsights?.find((ti) => ti.topic === topicItem.topic);
                const isMastered = topicItem.successRate >= 75;
                const isCritical = topicItem.successRate < 50;

                return (
                  <div
                    key={idx}
                    className="p-5 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-3 transition-all hover:bg-slate-100/60"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <span className="w-7 h-7 rounded-lg bg-indigo-100 text-indigo-800 font-bold font-mono text-xs flex items-center justify-center">
                          {idx + 1}
                        </span>
                        <div>
                          <h5 className="font-bold text-slate-900 text-sm">{topicItem.topic}</h5>
                          <p className="text-xs text-slate-500">
                            {topicItem.questionsCount} Quiz Sorusu • {topicItem.correctAnswers}/
                            {topicItem.totalAnswers} Doğru Cevap
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 self-end sm:self-auto">
                        <span
                          className={`px-3 py-1 rounded-lg text-xs font-bold ${
                            isMastered
                              ? 'bg-emerald-100 text-emerald-800'
                              : isCritical
                              ? 'bg-rose-100 text-rose-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {isMastered
                            ? 'Mükemmel Kavranmış'
                            : isCritical
                            ? 'Kritik Eksiklik'
                            : 'Geliştirilmeli'}
                        </span>
                        <span className="text-lg font-black font-mono text-slate-900">
                          %{topicItem.successRate}
                        </span>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="w-full bg-slate-200 h-3 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-700 ${
                          isMastered
                            ? 'bg-emerald-500'
                            : isCritical
                            ? 'bg-rose-500'
                            : 'bg-amber-500'
                        }`}
                        style={{ width: `${topicItem.successRate}%` }}
                      />
                    </div>

                    {/* AI Pedagogical Note if available */}
                    {aiInsight && (
                      <div className="p-3 bg-white rounded-xl border border-slate-200 text-xs space-y-1">
                        <div className="flex items-center gap-1.5 text-purple-700 font-bold">
                          <Sparkles className="w-3.5 h-3.5" />
                          <span>Gemini Değerlendirmesi:</span>
                        </div>
                        <p className="text-slate-700">{aiInsight.assessment}</p>
                        <p className="text-slate-500 italic pt-0.5">
                          Tavsiye: {aiInsight.recommendation}
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* TAB CONTENT 3: QUESTION-BY-QUESTION DIAGNOSTICS */}
      {activeTab === 'questions' && (
        <div className="space-y-6">
          <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-sm border border-slate-200 space-y-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h4 className="font-bold text-slate-900 text-base">Soru Bazlı Detaylı Analiz</h4>
                <p className="text-xs text-slate-500">
                  Her sorunun doğru cevaplanma oranı, şık dağılım yüzdeleri ve çeldirici analizi
                </p>
              </div>
              <span className="text-xs font-bold text-indigo-700 bg-indigo-50 px-3 py-1 rounded-lg">
                {questionStats.length} Quiz Sorusu
              </span>
            </div>

            <div className="space-y-6">
              {questionStats.map((q) => {
                return (
                  <div
                    key={q.id}
                    className="p-5 rounded-2xl bg-slate-50 border border-slate-200/90 space-y-4"
                  >
                    {/* Header */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 pb-3">
                      <div className="flex items-center gap-2.5">
                        <span className="w-8 h-8 rounded-xl bg-indigo-600 text-white font-black font-mono text-sm flex items-center justify-center">
                          S{q.index}
                        </span>
                        <div>
                          <span className="text-xs font-bold text-indigo-700 bg-indigo-50 px-2.5 py-0.5 rounded-md mr-2">
                            {q.topic}
                          </span>
                          <span className="text-xs text-slate-500">
                            Soru Sahibi: <strong>{q.studentNo}</strong>{' '}
                            {q.studentName && `(${q.studentName})`}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <span
                          className={`px-2.5 py-1 rounded-lg text-xs font-bold ${
                            q.difficulty === 'Kolay'
                              ? 'bg-emerald-100 text-emerald-800'
                              : q.difficulty === 'Orta'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-rose-100 text-rose-800'
                          }`}
                        >
                          {q.difficulty}
                        </span>
                        <span className="text-xs font-bold font-mono px-2.5 py-1 bg-white border border-slate-200 rounded-lg">
                          Doğruluk: %{q.successRate} ({q.correctCount}/{q.totalAnswers})
                        </span>
                      </div>
                    </div>

                    {/* Question text */}
                    <p className="text-sm font-semibold text-slate-900 leading-relaxed">
                      {q.question}
                    </p>

                    {/* Horizontal Options Distribution Bars */}
                    <div className="grid grid-cols-1 sm:grid-cols-5 gap-2 pt-1">
                      {(['A', 'B', 'C', 'D', 'E'] as const).map((letter) => {
                        const count = q.counts[letter] || 0;
                        const pct = q.totalAnswers > 0 ? Math.round((count / q.totalAnswers) * 100) : 0;
                        const isCorrect = q.correctAnswer === letter;
                        const isTopWrong = q.topWrongOption === letter && !isCorrect && pct > 20;

                        return (
                          <div
                            key={letter}
                            className={`p-2.5 rounded-xl border text-xs space-y-1.5 transition-colors ${
                              isCorrect
                                ? 'bg-emerald-50 border-emerald-300 ring-2 ring-emerald-500/20'
                                : isTopWrong
                                ? 'bg-amber-50 border-amber-300'
                                : 'bg-white border-slate-200'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span
                                className={`w-5 h-5 rounded-md font-bold text-[11px] flex items-center justify-center ${
                                  isCorrect
                                    ? 'bg-emerald-600 text-white'
                                    : 'bg-slate-100 text-slate-700'
                                }`}
                              >
                                {letter}
                              </span>
                              <span className="font-mono font-bold text-slate-700">
                                {count} ({pct}%)
                              </span>
                            </div>
                            <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                              <div
                                className={`h-full ${
                                  isCorrect
                                    ? 'bg-emerald-500'
                                    : isTopWrong
                                    ? 'bg-amber-500'
                                    : 'bg-slate-400'
                                }`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <div className="text-[10px] truncate text-slate-500">
                              {isCorrect ? (
                                <span className="text-emerald-700 font-bold">✓ Doğru Şık</span>
                              ) : isTopWrong ? (
                                <span className="text-amber-700 font-bold">⚠ Güçlü Çeldirici</span>
                              ) : (
                                <span>
                                  {letter === 'A'
                                    ? q.optionA
                                    : letter === 'B'
                                    ? q.optionB
                                    : letter === 'C'
                                    ? q.optionC
                                    : letter === 'D'
                                    ? q.optionD
                                    : q.optionE}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* TAB CONTENT 4: STUDENT LEADERBOARD & ANSWERS TABLE */}
      {activeTab === 'students' && (
        <div className="space-y-6">
          <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-sm border border-slate-200 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
              <div>
                <h4 className="font-bold text-slate-900 text-base">Öğrenci Başarı Tablosu</h4>
                <p className="text-xs text-slate-500">
                  Katılan tüm öğrencilerin doğru/yanlış adetleri, başarı yüzdeleri ve detaylı cevap dökümü
                </p>
              </div>

              {/* Search input */}
              <div className="relative w-full sm:w-64">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="text"
                  value={studentSearch}
                  onChange={(e) => setStudentSearch(e.target.value)}
                  placeholder="Öğrenci No veya İsim ara..."
                  className="w-full pl-9 pr-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:border-indigo-600 outline-hidden"
                />
              </div>
            </div>

            {/* Students Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase text-[10px] font-bold tracking-wider">
                    <th className="py-3 px-4">Sıra</th>
                    <th className="py-3 px-4">Öğrenci No</th>
                    <th className="py-3 px-4">Ad Soyad</th>
                    <th className="py-3 px-4 text-center">Cevaplanan</th>
                    <th className="py-3 px-4 text-center">Doğru</th>
                    <th className="py-3 px-4 text-center">Yanlış</th>
                    <th className="py-3 px-4 text-center">Başarı Puanı</th>
                    <th className="py-3 px-4 text-center">Durum</th>
                    <th className="py-3 px-4 text-right">Detay</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {filteredStudents.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-8 text-center text-slate-400 text-xs">
                        Arama kriterinize uygun öğrenci bulunamadı.
                      </td>
                    </tr>
                  ) : (
                    filteredStudents.map((st, idx) => {
                      const isExpanded = expandedStudentNo === st.studentNo;
                      const isTop3 = idx < 3;
                      const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : null;

                      return (
                        <React.Fragment key={st.studentNo}>
                          <tr className="hover:bg-slate-50/80 transition-colors">
                            <td className="py-3 px-4 font-mono font-bold text-slate-500">
                              {medal || idx + 1}
                            </td>
                            <td className="py-3 px-4 font-mono font-bold text-slate-900">
                              {st.studentNo}
                            </td>
                            <td className="py-3 px-4 font-bold text-slate-800">
                              {st.studentName}
                            </td>
                            <td className="py-3 px-4 text-center text-slate-600">{st.total}</td>
                            <td className="py-3 px-4 text-center text-emerald-600 font-bold">
                              {st.correct}
                            </td>
                            <td className="py-3 px-4 text-center text-rose-500 font-bold">
                              {st.wrongCount}
                            </td>
                            <td className="py-3 px-4 text-center">
                              <span
                                className={`font-mono font-black text-xs ${
                                  st.scorePercent >= 75
                                    ? 'text-emerald-600'
                                    : st.scorePercent >= 50
                                    ? 'text-amber-600'
                                    : 'text-rose-600'
                                }`}
                              >
                                %{st.scorePercent}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-center">
                              <span
                                className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                                  st.scorePercent >= 75
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : st.scorePercent >= 50
                                    ? 'bg-amber-100 text-amber-800'
                                    : 'bg-rose-100 text-rose-800'
                                }`}
                              >
                                {st.scorePercent >= 75
                                  ? 'Başarılı'
                                  : st.scorePercent >= 50
                                  ? 'Orta'
                                  : 'Destek'}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-right">
                              <button
                                type="button"
                                onClick={() =>
                                  setExpandedStudentNo(isExpanded ? null : st.studentNo)
                                }
                                className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold cursor-pointer inline-flex items-center gap-1"
                              >
                                <span>{isExpanded ? 'Kapat' : 'Cevaplar'}</span>
                                {isExpanded ? (
                                  <ChevronUp className="w-3.5 h-3.5" />
                                ) : (
                                  <ChevronDown className="w-3.5 h-3.5" />
                                )}
                              </button>
                            </td>
                          </tr>

                          {/* Expanded Answer Breakdown */}
                          {isExpanded && (
                            <tr className="bg-slate-50/90">
                              <td colSpan={9} className="py-3 px-6">
                                <div className="space-y-2 py-2">
                                  <h6 className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                                    {st.studentName} ({st.studentNo}) — Cevap Detayı
                                  </h6>
                                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                                    {st.answersList.map((ans, aIdx) => (
                                      <div
                                        key={ans.id || aIdx}
                                        className={`p-2.5 rounded-xl border text-xs flex items-center justify-between ${
                                          ans.isCorrect
                                            ? 'bg-emerald-50/70 border-emerald-200 text-emerald-950'
                                            : 'bg-rose-50/70 border-rose-200 text-rose-950'
                                        }`}
                                      >
                                        <div className="truncate mr-2">
                                          <span className="font-bold block truncate">
                                            {ans.topic}
                                          </span>
                                          <span className="text-[10px] text-slate-500 truncate block">
                                            {ans.questionText}
                                          </span>
                                        </div>
                                        <div className="flex items-center gap-1.5 shrink-0">
                                          <span
                                            className={`w-6 h-6 rounded-md font-bold font-mono text-xs flex items-center justify-center ${
                                              ans.isCorrect
                                                ? 'bg-emerald-600 text-white'
                                                : 'bg-rose-600 text-white'
                                            }`}
                                          >
                                            {ans.givenAnswer}
                                          </span>
                                          {!ans.isCorrect && (
                                            <span className="text-[10px] text-slate-500 font-mono">
                                              ({ans.correctAnswer})
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
