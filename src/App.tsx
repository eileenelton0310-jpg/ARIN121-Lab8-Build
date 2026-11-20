import React, { useState, useRef } from 'react';
import {
  GraduationCap,
  BookOpen,
  Sparkles,
  CheckCircle2,
  XCircle,
  AlertCircle,
  HelpCircle,
  RotateCcw,
  RefreshCw,
  Send,
  FileText,
  ChevronRight,
  ClipboardList,
  Check,
  Award,
} from 'lucide-react';

interface OptionItem {
  label: 'A' | 'B' | 'C' | 'D';
  text: string;
}

interface Question {
  id: number;
  question: string;
  options: OptionItem[];
}

interface QuestionResult {
  id: number;
  question: string;
  options: OptionItem[];
  studentChoice: 'A' | 'B' | 'C' | 'D';
  correctAnswer: 'A' | 'B' | 'C' | 'D';
  isCorrect: boolean;
  explanation: string;
  sourceReference: string;
}

interface QuizResults {
  score: number;
  total: number;
  percentage: number;
  formattedAnswerString: string;
  results: QuestionResult[];
  feedback: string;
}

const SAMPLE_NOTES = [
  {
    title: 'Biology: Cell Organelles',
    text: `Cell biology lecture notes:
The mitochondria is commonly referred to as the powerhouse of the cell because it generates most of the chemical energy needed to power biochemical reactions, in the form of ATP (adenosine triphosphate).
The nucleus houses the cell's genetic material (DNA) and directs gene expression and cell division.
Ribosomes are the macromolecular machines that synthesize proteins by translating messenger RNA (mRNA).
The rough endoplasmic reticulum is studded with ribosomes and specializes in folding and transporting nascent proteins, whereas the smooth endoplasmic reticulum synthesizes lipids, phospholipids, and steroids.
Lysosomes contain acid hydrolase enzymes that break down waste materials, cellular debris, and foreign pathogens.`,
  },
  {
    title: 'Computer Science: Database ACID Properties',
    text: `Relational Database Management Systems (RDBMS) - Transaction Management:
ACID is an acronym representing the four key properties ensuring database transactions are processed reliably:
1. Atomicity: Guarantees that a transaction is treated as a single, indivisible unit of work. Either all operations within the transaction succeed, or the entire transaction is rolled back with no changes made to the database.
2. Consistency: Ensures that any transaction brings the database from one valid state to another, maintaining all predefined schema constraints, foreign keys, and unique checks.
3. Isolation: Determines how transaction integrity is visible to other users and systems. Concurrent transactions execute without interfering with one another; the final state is equivalent to serial execution.
4. Durability: Guarantees that once a transaction has been committed, it will remain committed even in the event of a system crash, power outage, or hardware failure, typically recorded in non-volatile write-ahead logging (WAL).`,
  },
  {
    title: 'Economics: Supply, Demand, and Elasticity',
    text: `Principles of Microeconomics - Market Dynamics:
The Law of Demand states that, ceteris paribus (all else being equal), as the price of a good increases, the quantity demanded decreases. Conversely, the Law of Supply indicates that higher prices incentivize producers to supply a greater quantity to the market.
Equilibrium price occurs at the intersection where quantity demanded exactly equals quantity supplied, clearing the market with neither a surplus nor a shortage.
Price Elasticity of Demand (PED) measures the responsiveness of the quantity demanded to a change in price. If PED is greater than 1, demand is elastic, meaning consumers are highly sensitive to price changes. If PED is less than 1, demand is inelastic (often observed in essential goods like insulin or water), where quantity demanded shifts minimally despite price variations.
Substitutes and complements strongly influence demand: when the price of tea rises, the demand for coffee (a substitute) typically increases.`,
  },
];

export default function App() {
  const [studyNotes, setStudyNotes] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [clarificationNotice, setClarificationNotice] = useState<string | null>(null);

  // Quiz state
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [quizTopic, setQuizTopic] = useState<string>('');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<number, 'A' | 'B' | 'C' | 'D' | ''>>({
    1: '',
    2: '',
    3: '',
  });
  const [textAnswerInput, setTextAnswerInput] = useState<string>('');

  // Results state
  const [results, setResults] = useState<QuizResults | null>(null);

  // Refs for smooth navigation
  const quizSectionRef = useRef<HTMLDivElement>(null);
  const resultsSectionRef = useRef<HTMLDivElement>(null);
  const notesTextareaRef = useRef<HTMLTextAreaElement>(null);

  // Synchronize text answer format (e.g. "1B, 2D, 3A") with button clicks
  const updateOptionSelection = (questionId: number, choice: 'A' | 'B' | 'C' | 'D') => {
    const updated = { ...answers, [questionId]: choice };
    setAnswers(updated);
    setClarificationNotice(null);

    // Format string: e.g. "1B, 2D, 3A"
    const parts = [1, 2, 3].map(id => {
      const val = updated[id];
      return val ? `${id}${val}` : `${id}_`;
    });
    setTextAnswerInput(parts.join(', '));
  };

  // Synchronize button clicks with manual text answer input
  const handleTextAnswerChange = (val: string) => {
    setTextAnswerInput(val);
    setClarificationNotice(null);

    // Parse any patterns like "1A", "2C", "3D"
    const regex = /([123])\s*[:=\-]?\s*([A-Da-d])/g;
    let match;
    const newAnswers = { ...answers };
    while ((match = regex.exec(val)) !== null) {
      const qId = parseInt(match[1], 10);
      const opt = match[2].toUpperCase() as 'A' | 'B' | 'C' | 'D';
      newAnswers[qId] = opt;
    }
    setAnswers(newAnswers);
  };

  // Generate Quiz from study notes
  const handleGenerateQuiz = async () => {
    setErrorMessage(null);
    setClarificationNotice(null);

    if (!studyNotes || studyNotes.trim().length < 15) {
      setErrorMessage(
        'Please supply your study material first before generating a quiz. Paste your lecture notes, textbook readings, or study summary.'
      );
      if (notesTextareaRef.current) {
        notesTextareaRef.current.focus();
      }
      return;
    }

    setIsGenerating(true);
    setResults(null);
    setAnswers({ 1: '', 2: '', 3: '' });
    setTextAnswerInput('');

    try {
      const res = await fetch('/api/quiz/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: studyNotes }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to generate quiz. Please try again.');
      }

      setSessionId(data.sessionId);
      setQuizTopic(data.topic || 'Practice Quiz');
      setQuestions(data.questions || []);

      // Scroll smoothly to quiz
      setTimeout(() => {
        quizSectionRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    } catch (err: any) {
      setErrorMessage(err.message || 'An unexpected error occurred while generating the quiz.');
    } finally {
      setIsGenerating(false);
    }
  };

  // Submit and evaluate answers
  const handleSubmitAnswers = async () => {
    if (!sessionId) return;
    setErrorMessage(null);
    setClarificationNotice(null);

    // Client-side quick check for missing choices
    const missing = [1, 2, 3].filter(id => !answers[id]);
    if (missing.length > 0) {
      setClarificationNotice(
        `Your answer for Question ${missing.join(
          ' and Question '
        )} is missing or unclear. Please select your answer before submitting (e.g., format 1B, 2D, 3A).`
      );
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/quiz/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          answersMap: answers,
          answerString: textAnswerInput,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to evaluate answers.');
      }

      if (data.status === 'clarification_required') {
        setClarificationNotice(data.message);
        setIsSubmitting(false);
        return;
      }

      setResults(data);

      setTimeout(() => {
        resultsSectionRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 150);
    } catch (err: any) {
      setErrorMessage(err.message || 'An unexpected error occurred while grading your quiz.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Retake current quiz
  const handleRetakeQuiz = () => {
    setResults(null);
    setAnswers({ 1: '', 2: '', 3: '' });
    setTextAnswerInput('');
    setClarificationNotice(null);
    setErrorMessage(null);
    setTimeout(() => {
      quizSectionRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  // Reset to study notes
  const handleResetToNotes = () => {
    setResults(null);
    setQuestions([]);
    setSessionId(null);
    setAnswers({ 1: '', 2: '', 3: '' });
    setTextAnswerInput('');
    setClarificationNotice(null);
    setErrorMessage(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const loadSample = (sample: { title: string; text: string }) => {
    setStudyNotes(sample.text);
    setErrorMessage(null);
    setClarificationNotice(null);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans antialiased pb-20 selection:bg-indigo-100 selection:text-indigo-900">
      {/* Top Navigation / Academic Header */}
      <header className="sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-slate-200 shadow-xs">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="h-10 w-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-sm ring-4 ring-indigo-50">
              <GraduationCap className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-bold text-slate-900 tracking-tight text-base sm:text-lg">
                  QuizMate
                </span>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200/60">
                  University Practice
                </span>
              </div>
              <p className="text-xs text-slate-500 hidden sm:block">
                3-Question Practice Assistant strictly grounded in your study notes
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {sessionId && (
              <button
                onClick={handleResetToNotes}
                className="text-xs sm:text-sm font-medium text-slate-600 hover:text-slate-900 px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 transition-colors flex items-center space-x-1"
              >
                <BookOpen className="h-3.5 w-3.5 mr-1" />
                <span>Change Notes</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 pt-8 space-y-8">
        {/* Intro Banner */}
        <section className="bg-gradient-to-br from-indigo-900 via-slate-900 to-indigo-950 text-white rounded-2xl p-6 sm:p-8 shadow-md relative overflow-hidden">
          <div className="absolute -right-8 -bottom-8 w-48 h-48 bg-indigo-500/10 rounded-full blur-2xl pointer-events-none" />
          <div className="relative z-10 max-w-2xl">
            <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-200 text-xs font-medium mb-3 border border-indigo-400/20">
              <Sparkles className="h-3.5 w-3.5" />
              <span>Evidence-Based Active Recall</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white mb-2">
              University Practice Quiz Assistant
            </h1>
            <p className="text-slate-300 text-sm sm:text-base leading-relaxed">
              Paste your lecture notes, textbook passages, or slides below. QuizMate creates a
              custom 3-question multiple-choice practice exam based strictly on your source material,
              then provides instant scores and grounded explanations for any mistakes.
            </p>
          </div>
        </section>

        {/* Global Error Notice */}
        {errorMessage && (
          <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 flex items-start space-x-3 text-rose-800 animate-fadeIn">
            <AlertCircle className="h-5 w-5 text-rose-600 shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-semibold text-rose-900">Attention Required</p>
              <p className="mt-0.5">{errorMessage}</p>
            </div>
          </div>
        )}

        {/* STUDY NOTES INPUT SECTION */}
        <section className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 sm:p-7">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-100 gap-2">
            <div className="flex items-center space-x-2">
              <FileText className="h-5 w-5 text-indigo-600" />
              <h2 className="text-lg font-bold text-slate-900">Your Study Material</h2>
            </div>
            <div className="text-xs text-slate-500">
              {studyNotes.trim() ? `${studyNotes.trim().split(/\s+/).length} words` : 'Empty'}
            </div>
          </div>

          <div className="mt-4">
            <label htmlFor="notesInput" className="block text-xs font-medium text-slate-600 mb-1.5">
              Paste your lecture notes, summaries, or reading text (Source Material):
            </label>
            <textarea
              id="notesInput"
              ref={notesTextareaRef}
              rows={7}
              value={studyNotes}
              onChange={e => {
                setStudyNotes(e.target.value);
                if (errorMessage) setErrorMessage(null);
              }}
              placeholder="Paste your course notes here... (e.g., cell biology, organic chemistry reactions, history timelines, algorithms, case law summaries)..."
              className="w-full rounded-xl border border-slate-300 p-4 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all font-mono leading-relaxed bg-slate-50/50 hover:bg-white"
            />
          </div>

          {/* Sample Notes Buttons */}
          <div className="mt-3">
            <span className="text-xs font-medium text-slate-500 mr-2">Or load a sample:</span>
            <div className="inline-flex flex-wrap gap-2 mt-1">
              {SAMPLE_NOTES.map(sample => (
                <button
                  key={sample.title}
                  type="button"
                  onClick={() => loadSample(sample)}
                  className="text-xs bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 text-slate-700 font-medium px-2.5 py-1 rounded-md border border-slate-200 transition-colors"
                >
                  {sample.title}
                </button>
              ))}
            </div>
          </div>

          {/* Action Row */}
          <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-slate-100">
            <div className="flex items-center text-xs text-slate-500 space-x-1.5">
              <HelpCircle className="h-4 w-4 text-slate-400" />
              <span>Questions, correct answers, and explanations are strictly grounded in this text.</span>
            </div>

            <button
              type="button"
              onClick={handleGenerateQuiz}
              disabled={isGenerating}
              className={`w-full sm:w-auto inline-flex items-center justify-center space-x-2 px-6 py-2.5 rounded-xl font-semibold text-sm shadow-sm transition-all ${
                isGenerating
                  ? 'bg-indigo-400 text-white cursor-not-allowed'
                  : 'bg-indigo-600 hover:bg-indigo-700 text-white active:scale-[0.98]'
              }`}
            >
              {isGenerating ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  <span>Generating 3 Questions...</span>
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  <span>Generate Quiz</span>
                </>
              )}
            </button>
          </div>
        </section>

        {/* MODULE 1: ACTIVE QUIZ QUESTIONS */}
        {questions.length > 0 && (
          <div ref={quizSectionRef} className="space-y-6 pt-4 animate-fadeIn">
            {/* Module 1 Header Card */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 sm:p-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="text-xs font-bold tracking-wider uppercase px-2.5 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200/60">
                      Module 1
                    </span>
                    <h2 className="text-lg font-bold text-slate-900">
                      Practice Quiz: {quizTopic}
                    </h2>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    Three multiple-choice questions based on your provided material. Answer keys and explanations will be revealed after submission.
                  </p>
                </div>

                {/* Response Format Guideline Banner */}
                <div className="bg-amber-50/80 border border-amber-200 rounded-xl px-3.5 py-2 text-xs text-amber-900 flex items-center space-x-2">
                  <ClipboardList className="h-4 w-4 text-amber-600 shrink-0" />
                  <span>
                    Reply format: <strong className="font-mono text-amber-950 font-bold">1B, 2D, 3A</strong>
                  </span>
                </div>
              </div>

              {/* Clarification Notice Banner */}
              {clarificationNotice && (
                <div className="mt-4 bg-amber-50 border border-amber-300 rounded-xl p-3.5 text-xs text-amber-900 flex items-start space-x-2.5">
                  <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <strong className="font-semibold">Clarification Required:</strong>
                    <p className="mt-0.5">{clarificationNotice}</p>
                  </div>
                </div>
              )}

              {/* Questions List */}
              <div className="mt-6 space-y-6">
                {questions.map((q, qIndex) => {
                  const currentAnswer = answers[q.id];
                  return (
                    <div
                      key={q.id}
                      className={`rounded-xl border p-5 sm:p-6 transition-all ${
                        currentAnswer
                          ? 'border-indigo-200 bg-indigo-50/30'
                          : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}
                    >
                      {/* Question Number & Text */}
                      <div className="flex items-start space-x-3 mb-4">
                        <span className="shrink-0 flex items-center justify-center w-7 h-7 rounded-lg bg-indigo-600 text-white font-bold text-xs shadow-xs">
                          {q.id}
                        </span>
                        <div className="flex-1">
                          <h3 className="font-semibold text-slate-900 text-sm sm:text-base leading-snug">
                            {q.question}
                          </h3>
                        </div>
                      </div>

                      {/* 4 Clickable Choices: A, B, C, D */}
                      <div className="grid grid-cols-1 gap-2.5 pt-1">
                        {q.options.map(option => {
                          const isSelected = currentAnswer === option.label;
                          return (
                            <button
                              key={option.label}
                              type="button"
                              onClick={() => updateOptionSelection(q.id, option.label)}
                              className={`w-full text-left p-3.5 rounded-xl border text-sm transition-all flex items-start space-x-3 group ${
                                isSelected
                                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs ring-2 ring-indigo-200'
                                  : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-700'
                              }`}
                            >
                              <span
                                className={`shrink-0 flex items-center justify-center w-6 h-6 rounded-md font-bold text-xs transition-colors ${
                                  isSelected
                                    ? 'bg-white text-indigo-700'
                                    : 'bg-slate-100 text-slate-700 group-hover:bg-slate-200'
                                }`}
                              >
                                {option.label}
                              </span>
                              <span
                                className={`flex-1 pt-0.5 leading-relaxed ${
                                  isSelected ? 'font-medium text-white' : 'text-slate-800'
                                }`}
                              >
                                {option.text}
                              </span>
                              {isSelected && (
                                <Check className="h-4 w-4 text-white shrink-0 mt-1" />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Format & Submission Bar */}
              <div className="mt-8 pt-6 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="w-full sm:w-auto">
                  <label htmlFor="textFormat" className="block text-xs font-medium text-slate-500 mb-1">
                    Student Answer String (auto-syncs with your clicks or type directly):
                  </label>
                  <div className="relative max-w-xs">
                    <input
                      id="textFormat"
                      type="text"
                      value={textAnswerInput}
                      onChange={e => handleTextAnswerChange(e.target.value)}
                      placeholder="e.g. 1B, 2D, 3A"
                      className="w-full font-mono text-sm px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-900 bg-white uppercase tracking-wider"
                    />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleSubmitAnswers}
                  disabled={isSubmitting}
                  className={`w-full sm:w-auto inline-flex items-center justify-center space-x-2 px-7 py-3 rounded-xl font-bold text-sm shadow-sm transition-all ${
                    isSubmitting
                      ? 'bg-slate-400 text-white cursor-not-allowed'
                      : 'bg-emerald-600 hover:bg-emerald-700 text-white active:scale-[0.98]'
                  }`}
                >
                  {isSubmitting ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      <span>Checking Against Material...</span>
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4" />
                      <span>Submit Answers</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MODULE 2: EVALUATION AND RESULTS AREA */}
        {results && (
          <div ref={resultsSectionRef} className="space-y-6 pt-4 animate-fadeIn">
            {/* Score Summary Card */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-md p-6 sm:p-7 overflow-hidden relative">
              <div
                className={`absolute top-0 left-0 right-0 h-2 ${
                  results.score === 3
                    ? 'bg-emerald-500'
                    : results.score === 2
                    ? 'bg-indigo-500'
                    : results.score === 1
                    ? 'bg-amber-500'
                    : 'bg-rose-500'
                }`}
              />

              <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                <div className="flex items-center space-x-4">
                  <div
                    className={`w-16 h-16 rounded-2xl flex items-center justify-center text-white shrink-0 shadow-sm ${
                      results.score === 3
                        ? 'bg-emerald-600 ring-4 ring-emerald-100'
                        : results.score === 2
                        ? 'bg-indigo-600 ring-4 ring-indigo-100'
                        : results.score === 1
                        ? 'bg-amber-600 ring-4 ring-amber-100'
                        : 'bg-rose-600 ring-4 ring-rose-100'
                    }`}
                  >
                    <Award className="h-8 w-8" />
                  </div>
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="text-xs font-bold tracking-wider uppercase px-2 py-0.5 rounded-md bg-slate-100 text-slate-700">
                        Module 2 Results
                      </span>
                      <span className="text-xs font-mono text-slate-500">
                        Answers: {results.formattedAnswerString}
                      </span>
                    </div>
                    <h3 className="text-2xl font-black text-slate-900 mt-1">
                      Final Score: {results.score} / {results.total} ({results.percentage}%)
                    </h3>
                    <p className="text-sm text-slate-600 mt-1 max-w-xl">{results.feedback}</p>
                  </div>
                </div>

                {/* Score Pills */}
                <div className="flex items-center space-x-2 bg-slate-50 p-2 rounded-xl border border-slate-200">
                  {results.results.map(r => (
                    <div
                      key={r.id}
                      className={`flex items-center space-x-1 px-3 py-1.5 rounded-lg text-xs font-bold ${
                        r.isCorrect
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                          : 'bg-rose-100 text-rose-800 border border-rose-300'
                      }`}
                    >
                      <span>Q{r.id}:</span>
                      <span>{r.studentChoice}</span>
                      {r.isCorrect ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 ml-0.5" />
                      ) : (
                        <XCircle className="h-3.5 w-3.5 text-rose-600 ml-0.5" />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Detailed Question Review & Grounded Explanations */}
            <div className="space-y-4">
              <div className="flex items-center justify-between px-1">
                <h4 className="text-base font-bold text-slate-900 flex items-center space-x-2">
                  <span>Detailed Answer Explanations</span>
                  <span className="text-xs font-normal text-slate-500">
                    (Grounded strictly in your study material)
                  </span>
                </h4>
              </div>

              {results.results.map(item => {
                return (
                  <div
                    key={item.id}
                    className={`rounded-2xl border p-5 sm:p-6 bg-white transition-all shadow-xs ${
                      item.isCorrect ? 'border-emerald-200' : 'border-rose-200'
                    }`}
                  >
                    {/* Header: Question Status */}
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="flex items-center space-x-3">
                        <span
                          className={`flex items-center justify-center w-7 h-7 rounded-lg text-white font-bold text-xs shrink-0 ${
                            item.isCorrect ? 'bg-emerald-600' : 'bg-rose-600'
                          }`}
                        >
                          {item.id}
                        </span>
                        <span
                          className={`inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold ${
                            item.isCorrect
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-rose-50 text-rose-700 border border-rose-200'
                          }`}
                        >
                          {item.isCorrect ? (
                            <>
                              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                              <span>Correct</span>
                            </>
                          ) : (
                            <>
                              <XCircle className="h-3.5 w-3.5 text-rose-600" />
                              <span>Incorrect</span>
                            </>
                          )}
                        </span>
                      </div>

                      <div className="text-xs font-mono text-slate-600">
                        Your answer: <strong className="text-slate-900 font-bold">{item.studentChoice}</strong>
                        {!item.isCorrect && (
                          <span className="text-emerald-700 font-bold ml-2">
                            (Correct: {item.correctAnswer})
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Question Text */}
                    <p className="font-semibold text-slate-900 text-sm sm:text-base mb-4">
                      {item.question}
                    </p>

                    {/* Options Breakdown */}
                    <div className="grid grid-cols-1 gap-2 mb-4">
                      {item.options.map(opt => {
                        const isStudentChoice = item.studentChoice === opt.label;
                        const isCorrectChoice = item.correctAnswer === opt.label;

                        let style = 'bg-slate-50 border-slate-200 text-slate-700';
                        if (isCorrectChoice) {
                          style = 'bg-emerald-50 border-emerald-300 text-emerald-900 font-medium';
                        } else if (isStudentChoice && !item.isCorrect) {
                          style = 'bg-rose-50 border-rose-300 text-rose-900 line-through';
                        }

                        return (
                          <div
                            key={opt.label}
                            className={`p-3 rounded-xl border text-sm flex items-start space-x-3 ${style}`}
                          >
                            <span
                              className={`shrink-0 flex items-center justify-center w-6 h-6 rounded-md font-bold text-xs ${
                                isCorrectChoice
                                  ? 'bg-emerald-600 text-white'
                                  : isStudentChoice && !item.isCorrect
                                  ? 'bg-rose-600 text-white'
                                  : 'bg-slate-200 text-slate-700'
                              }`}
                            >
                              {opt.label}
                            </span>
                            <span className="flex-1 pt-0.5">{opt.text}</span>
                            {isCorrectChoice && (
                              <span className="text-xs font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">
                                Correct Answer
                              </span>
                            )}
                            {isStudentChoice && !item.isCorrect && (
                              <span className="text-xs font-bold text-rose-700 bg-rose-100 px-2 py-0.5 rounded">
                                Your Choice
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* Explanation Box */}
                    <div className="bg-slate-50 rounded-xl p-4 border border-slate-200/80 text-sm">
                      <div className="flex items-center space-x-1.5 text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                        <BookOpen className="h-3.5 w-3.5 text-indigo-600" />
                        <span>Explanation from Study Notes:</span>
                      </div>
                      <p className="text-slate-800 leading-relaxed text-sm">
                        {item.explanation}
                      </p>

                      {item.sourceReference && (
                        <div className="mt-2.5 pt-2 border-t border-slate-200/60 text-xs text-slate-500 flex items-start space-x-1.5">
                          <span className="font-semibold text-slate-600 shrink-0">Source Excerpt:</span>
                          <span className="italic font-mono text-slate-600">
                            "{item.sourceReference}"
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Action Bar (Module 2 specifies: do not make a new quiz unless user asks for one) */}
            <div className="bg-white rounded-2xl border border-slate-200 p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="text-xs text-slate-500">
                Want to practice again or explore different questions from your notes?
              </div>

              <div className="flex items-center space-x-3 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={handleRetakeQuiz}
                  className="flex-1 sm:flex-initial inline-flex items-center justify-center space-x-1.5 px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-50 font-semibold text-xs transition-colors"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>Retake This Quiz</span>
                </button>

                <button
                  type="button"
                  onClick={handleGenerateQuiz}
                  disabled={isGenerating}
                  className="flex-1 sm:flex-initial inline-flex items-center justify-center space-x-1.5 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs shadow-xs transition-colors"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${isGenerating ? 'animate-spin' : ''}`} />
                  <span>Generate New Quiz</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
