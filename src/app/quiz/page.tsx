'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Clock, Send, CheckCircle, XCircle, Brain, LogOut } from 'lucide-react';
import { exitQuiz } from '@/actions';

type QuestionDTO = {
  id: number;                 // 1..N
  question: string;
  alternatives: string[];     // A..D
  correctAnswer?: number;     // opcional
};

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080';
const PLAYER_SSE = `${API_BASE}/stream/player`;
const QN_ONE_URL = (n: number) => `${API_BASE}/api/questions/${n}`;
const QN_ALL_URL = `${API_BASE}/api/questions`;

// fallback local (se a API de questões ainda não estiver pronta)
const LOCAL_QUESTIONS: Record<number, QuestionDTO> = {
  1: { id: 1, question: 'Capital da França?', alternatives: ['Paris', 'Roma', 'Berlim', 'Madri'], correctAnswer: 0 },
  2: { id: 2, question: '2 + 2 = ?', alternatives: ['4', '3', '5', '22'], correctAnswer: 0 },
};

// util pra ler playerId (localStorage e/ou cookie)
function getPlayerId(): string | null {
  if (typeof window === 'undefined') return null;
  const fromLS = localStorage.getItem('playerId');
  if (fromLS) return fromLS;
  const cookie = document.cookie.split('; ').find(c => c.startsWith('playerId='));
  return cookie ? decodeURIComponent(cookie.split('=')[1]) : null;
}

export default function QuizPage() {
  // estado principal
  const [currentQuestion, setCurrentQuestion] = useState<QuestionDTO | null>(null);
  const [isWaiting, setIsWaiting] = useState(true);

  // timer/round
  const ROUND_TIME = 10;
  const [timeLeft, setTimeLeft] = useState(ROUND_TIME);
  const [progressValue, setProgressValue] = useState(100);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // resposta
  const [selected, setSelected] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasAnswered, setHasAnswered] = useState(false);
  const [showResult, setShowResult] = useState(false);

  // SSE
  const esRef = useRef<EventSource | null>(null);
  const retryRef = useRef(0);
  const reconnectTimerRef = useRef<NodeJS.Timeout | null>(null);

  // ===== helpers =====
  const safeParse = <T,>(s: string): T | null => { try { return JSON.parse(s) as T; } catch { return null; } };

  const cleanupTimer = () => { if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; } };
  const cleanupReconnect = () => { if (reconnectTimerRef.current) { clearTimeout(reconnectTimerRef.current); reconnectTimerRef.current = null; } };

  const startRound = useCallback((q: QuestionDTO) => {
    // inicia nova rodada
    setCurrentQuestion(q);
    setIsWaiting(false);
    setSelected(null);
    setHasAnswered(false);
    setShowResult(false);
    setIsSubmitting(false);
    setTimeLeft(ROUND_TIME);
    setProgressValue(100);

    cleanupTimer();
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        const next = prev - 1;
        setProgressValue((Math.max(next, 0) / ROUND_TIME) * 100);
        if (next <= 0) {
          cleanupTimer();
          setHasAnswered(true);
          setShowResult(true);
        }
        return next;
      });
    }, 1000);
  }, []);

  const mapQuestion = (dto: any, n: number): QuestionDTO => ({
    id: dto?.id ?? n,
    question: dto?.text ?? dto?.question ?? `Questão ${n}`,
    alternatives: Array.isArray(dto?.alternatives) ? dto.alternatives.map((a: any) => a?.text ?? a) : [],
    correctAnswer:
      typeof dto?.correctAnswer === 'number'
        ? dto.correctAnswer
        : Array.isArray(dto?.alternatives)
          ? dto.alternatives.findIndex((a: any) => a?.correct)
          : undefined,
  });

  const fetchQuestion = useCallback(async (questionNumber: number): Promise<QuestionDTO> => {
    // 1) GET /api/questions/{n}
    try {
      const r1 = await fetch(QN_ONE_URL(questionNumber), { cache: 'no-store' });
      if (r1.ok) return mapQuestion(await r1.json(), questionNumber);
    } catch { /* ignore */ }

    // 2) GET /api/questions
    try {
      const r2 = await fetch(QN_ALL_URL, { cache: 'no-store' });
      if (r2.ok) {
        const all = await r2.json();
        const raw = Array.isArray(all) ? all[questionNumber - 1] : all?.[questionNumber];
        if (raw) return mapQuestion(raw, questionNumber);
      }
    } catch { /* ignore */ }

    // 3) fallback local
    return LOCAL_QUESTIONS[questionNumber] ?? {
      id: questionNumber, question: `Questão ${questionNumber}`, alternatives: ['A', 'B', 'C', 'D'],
    };
  }, []);

  const connectSSE = useCallback(() => {
    const pid = getPlayerId();
    if (!pid) {
      console.warn('[player] sem playerId — faça /start antes.');
      return;
    }

    cleanupReconnect();
    if (esRef.current) { try { esRef.current.close(); } catch {} esRef.current = null; }

    const url = `${PLAYER_SSE}?playerId=${encodeURIComponent(pid)}`;
    const es = new EventSource(url);
    esRef.current = es;
    console.log('[player SSE] conectando…', url);

    es.onopen = () => {
      retryRef.current = 0;
      console.log('[player SSE] aberto');
    };

    es.addEventListener('connected', (e) => {
      retryRef.current = 0;
      console.log('[player SSE] handshake ok', (e as MessageEvent).data);
    });

    es.addEventListener('question.changed', async (e) => {
      const data = safeParse<{ questionNumber: number }>((e as MessageEvent).data);
      if (!data?.questionNumber) return;
      const q = await fetchQuestion(data.questionNumber);
      startRound(q);
    });

    es.onerror = () => {
      try { es.close(); } catch {}
      const delay = Math.min(10000, 500 * 2 ** retryRef.current++);
      console.warn(`[player SSE] erro — reconectar em ${delay}ms (tentativa #${retryRef.current})`);
      reconnectTimerRef.current = setTimeout(connectSSE, delay);
    };
  }, [fetchQuestion, startRound]);

  useEffect(() => {
    connectSSE();
    return () => {
      if (esRef.current) esRef.current.close();
      cleanupTimer();
      cleanupReconnect();
    };
  }, [connectSSE]);

  // ===== ações UI =====
  const handleSelectAnswer = (i: number) => {
    if (isWaiting || hasAnswered || timeLeft <= 0 || !currentQuestion) return;
    setSelected(i);
  };

  const handleSubmitAnswer = async () => {
    if (selected == null || isSubmitting || hasAnswered || !currentQuestion) return;
    setIsSubmitting(true);
    try {
      // TODO: trocar para endpoint real quando existir
      await fetch('/api/submit-answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          questionId: currentQuestion.id,
          selectedAnswer: selected,
          timeUsed: ROUND_TIME - timeLeft,
        }),
      });
      setHasAnswered(true);
      setShowResult(true);
    } catch (e) {
      console.error('[player] submit failed', e);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleNextQuestion = () => {
    cleanupTimer();
    setIsWaiting(true);
    setCurrentQuestion(null);
    setSelected(null);
    setHasAnswered(false);
    setShowResult(false);
    setTimeLeft(ROUND_TIME);
    setProgressValue(100);
  };

  const getProgressColor = () => {
    if (timeLeft > 7) return 'bg-green-500';
    if (timeLeft > 4) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  // ===== render =====
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="max-w-4xl mx-auto">
        {/* header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center">
              <Brain className="w-6 h-6 text-indigo-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">BrainUp Quiz</h1>
              <p className="text-sm text-slate-600">
                {isWaiting ? 'Aguardando questão...' : `Pergunta ${currentQuestion?.id ?? 0}`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {!isWaiting && currentQuestion && (
              <div className="text-right">
                <div className="flex items-center gap-2 mb-1">
                  <Clock className={`w-5 h-5 ${timeLeft <= 3 ? 'text-red-500' : 'text-slate-600'}`} />
                  <span className={`text-2xl font-bold ${timeLeft <= 3 ? 'text-red-500' : 'text-slate-900'}`}>
                    {timeLeft}s
                  </span>
                </div>
                <Badge variant={timeLeft <= 3 ? 'destructive' : 'secondary'}>
                  {timeLeft > 0 ? 'Tempo restante' : 'Tempo esgotado!'}
                </Badge>
              </div>
            )}
            <form action={exitQuiz}>
              <Button variant="outline" size="sm" className="flex items-center gap-2 text-slate-600 hover:text-red-600 hover:border-red-300">
                <LogOut className="w-4 h-4" />
                Sair
              </Button>
            </form>
          </div>
        </div>

        {isWaiting ? (
          // tela de espera
          <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
            <Card className="w-full max-w-md">
              <CardHeader>
                <div className="mx-auto mb-4 w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center">
                  <Clock className="w-8 h-8 text-indigo-600 animate-pulse" />
                </div>
                <CardTitle className="text-xl">Aguardando Questão</CardTitle>
                <CardDescription>Você será notificado quando uma nova questão estiver disponível</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-center space-x-1">
                  <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce [animation-delay:-0.3s]" />
                  <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce [animation-delay:-0.15s]" />
                  <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce" />
                </div>
              </CardContent>
            </Card>
          </div>
        ) : (
          <>
            <div className="mb-6">
              <Progress value={progressValue} className={`h-3 transition-all duration-1000 ${getProgressColor()}`} />
            </div>

            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="text-xl text-center">{currentQuestion?.question}</CardTitle>
                <CardDescription className="text-center">Selecione uma alternativa e clique em "Enviar Resposta"</CardDescription>
              </CardHeader>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              {currentQuestion?.alternatives.map((alt, idx) => {
                const correct = currentQuestion?.correctAnswer;
                const isCorrect = correct != null && idx === correct;
                const pickedWrong = showResult && selected === idx && !isCorrect;

                return (
                  <Card
                    key={idx}
                    onClick={() => handleSelectAnswer(idx)}
                    className={[
                      'cursor-pointer transition-all duration-200',
                      selected === idx ? 'ring-2 ring-indigo-500 bg-indigo-50 border-indigo-200' : 'hover:bg-slate-50 hover:border-slate-300',
                      (hasAnswered || timeLeft === 0) ? 'cursor-not-allowed opacity-60' : '',
                      showResult && isCorrect ? 'ring-2 ring-green-500 bg-green-50 border-green-200' : '',
                      showResult && pickedWrong ? 'ring-2 ring-red-500 bg-red-50 border-red-200' : '',
                    ].join(' ')}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 ${
                          selected === idx ? 'bg-indigo-500 border-indigo-500 text-white' : 'border-slate-300'
                        }`}>
                          <span className="font-semibold">{String.fromCharCode(65 + idx)}</span>
                        </div>
                        <span className="flex-1 font-medium text-slate-900">{alt}</span>
                        {showResult && isCorrect && <CheckCircle className="w-6 h-6 text-green-500" />}
                        {showResult && pickedWrong && <XCircle className="w-6 h-6 text-red-500" />}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            <div className="flex flex-col gap-4">
              {!hasAnswered && timeLeft > 0 && (
                <Button onClick={handleSubmitAnswer} disabled={selected === null || isSubmitting} className="w-full h-12 text-lg font-semibold bg-indigo-600 hover:bg-indigo-700">
                  {isSubmitting ? (
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                      Enviando...
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Send className="w-5 h-5" />
                      Enviar Resposta
                    </div>
                  )}
                </Button>
              )}

              {showResult && (
                <Card className={
                  selected === currentQuestion?.correctAnswer
                    ? 'bg-green-50 border-green-200'
                    : timeLeft === 0 && selected === null
                      ? 'bg-yellow-50 border-yellow-200'
                      : 'bg-red-50 border-red-200'
                }>
                  <CardContent className="p-4 text-center">
                    <div className="flex items-center justify-center gap-2 mb-2">
                      {selected === currentQuestion?.correctAnswer ? (
                        <>
                          <CheckCircle className="w-6 h-6 text-green-600" />
                          <span className="text-lg font-bold text-green-800">Correto!</span>
                        </>
                      ) : timeLeft === 0 && selected === null ? (
                        <>
                          <Clock className="w-6 h-6 text-yellow-600" />
                          <span className="text-lg font-bold text-yellow-800">Tempo Esgotado!</span>
                        </>
                      ) : (
                        <>
                          <XCircle className="w-6 h-6 text-red-600" />
                          <span className="text-lg font-bold text-red-800">Incorreto!</span>
                        </>
                      )}
                    </div>
                    <p className="text-sm text-slate-600">
                      {selected === currentQuestion?.correctAnswer
                        ? 'Parabéns! Você acertou.'
                        : timeLeft === 0 && selected === null
                          ? 'O tempo acabou antes da resposta.'
                          : `A resposta correta era: ${String.fromCharCode(65 + (currentQuestion?.correctAnswer ?? 0))} - ${currentQuestion?.alternatives[(currentQuestion?.correctAnswer ?? 0)]}`
                      }
                    </p>
                    <Button onClick={handleNextQuestion} className="mt-4 bg-slate-600 hover:bg-slate-700">Aguardar Próxima Questão</Button>
                  </CardContent>
                </Card>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
