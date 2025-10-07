'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Settings, Users, Trophy, CheckCircle } from 'lucide-react';

type Player = { id: string; name: string; score: number; active: boolean };

// --------- config ---------
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080';
const SSE_URL = `${API_BASE}/stream/admin`;
const CHANGE_QUESTION_URL = `${API_BASE}/api/change-question`;

// --------- helpers ---------
const safeParse = <T,>(s: string): T | null => { try { return JSON.parse(s) as T; } catch { return null; } };
const sortByScore = (a: Player, b: Player) => b.score - a.score;

export default function AdminPage() {
  const [selectedQuestion, setSelectedQuestion] = useState<number | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const esRef = useRef<EventSource | null>(null);
  const retryRef = useRef(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const onlineCount = useMemo(() => players.filter(p => p.active).length, [players]);
  const avgScore = useMemo(
    () => (players.length ? players.reduce((a, p) => a + p.score, 0) / players.length : 0),
    [players]
  );

  const upsertPlayer = useCallback((p: Player) => {
    setPlayers(prev => {
      const i = prev.findIndex(x => x.id === p.id);
      if (i === -1) return [...prev, p];
      const next = prev.slice();
      next[i] = { ...prev[i], ...p };
      return next;
    });
  }, []);

  const markExited = useCallback((id: string) => {
    setPlayers(prev => prev.map(p => (p.id === id ? { ...p, active: false } : p)));
  }, []);

  const connectSSE = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (esRef.current) { try { esRef.current.close(); } catch {} esRef.current = null; }

    const es = new EventSource(SSE_URL);
    esRef.current = es;
    console.log('[SSE] abrindo', SSE_URL);

    es.addEventListener('connected', (e) => {
      retryRef.current = 0;
      console.log('[SSE] conectado, adminId=', (e as MessageEvent).data);
    });

    es.addEventListener('player.joined', (e) => {
      const data = safeParse<Player>((e as MessageEvent).data);
      if (!data) return;
      upsertPlayer({ ...data, active: true });
    });

    es.addEventListener('player.exited', (e) => {
      const data = safeParse<Player>((e as MessageEvent).data);
      if (!data) return;
      markExited(data.id);
    });

    es.addEventListener('question.changed', (e) => {
      const data = safeParse<{ questionNumber: number }>((e as MessageEvent).data);
      if (data?.questionNumber) {
        setSelectedQuestion(data.questionNumber);
        setTimeout(() => setSelectedQuestion(null), 1200);
      }
    });

    es.onerror = () => {
      es.close();
      const delay = Math.min(10_000, 500 * 2 ** retryRef.current++);
      console.warn(`[SSE] erro. tentando reconectar em ${delay}ms`);
      timerRef.current = setTimeout(connectSSE, delay);
    };
  }, [upsertPlayer, markExited]);

  useEffect(() => {
    connectSSE();
    return () => { if (timerRef.current) clearTimeout(timerRef.current); if (esRef.current) esRef.current.close(); };
  }, [connectSSE]);

  const handleQuestionChange = useCallback(async (questionNumber: number) => {
    setIsLoading(true);
    setSelectedQuestion(questionNumber);
    try {
      const res = await fetch(CHANGE_QUESTION_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questionNumber }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setTimeout(() => setSelectedQuestion(null), 1200);
    } catch (e) {
      console.error('Erro ao trocar questão:', e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const simulatePlayerExit = useCallback(() => {
    const actives = players.filter(p => p.active);
    if (!actives.length) return;
    markExited(actives[Math.floor(Math.random() * actives.length)].id);
  }, [players, markExited]);

  const addTestPlayer = useCallback(() => {
    const p: Player = { id: `test-${Date.now()}`, name: `Player Teste ${new Date().toLocaleTimeString()}`, score: Math.floor(Math.random()*10), active: true };
    upsertPlayer(p);
  }, [upsertPlayer]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-6">
      <div className="max-w-7xl mx-auto">
        {/* header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 bg-slate-200 rounded-lg flex items-center justify-center">
              <Settings className="w-6 h-6 text-slate-600" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-slate-900">Painel do Administrador</h1>
              <p className="text-slate-600">Gerencie questões e acompanhe o desempenho dos usuários</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* controle de questões */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><CheckCircle className="w-5 h-5 text-blue-600" />Controle de Questões</CardTitle>
                <CardDescription>Selecione uma questão para exibir aos participantes</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-5 gap-3">
                  {Array.from({ length: 10 }, (_, i) => i + 1).map((q) => (
                    <Button
                      key={q}
                      variant={selectedQuestion === q ? 'default' : 'outline'}
                      className={`h-16 text-lg font-semibold transition-all ${
                        selectedQuestion === q ? 'bg-green-600 hover:bg-green-700 text-white' : 'hover:bg-blue-50 hover:border-blue-300'
                      }`}
                      onClick={() => handleQuestionChange(q)}
                      disabled={isLoading}
                    >
                      {isLoading && selectedQuestion === q
                        ? <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                        : <>Q{q}{selectedQuestion === q && <CheckCircle className="w-4 h-4 ml-1" />}</>}
                    </Button>
                  ))}
                </div>

                {selectedQuestion && (
                  <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg">
                    <p className="text-green-800 font-medium">✓ Questão {selectedQuestion} foi enviada aos participantes</p>
                  </div>
                )}

                {/* debug */}
                <div className="mt-6 p-4 bg-slate-50 border border-slate-200 rounded-lg">
                  <h3 className="font-medium text-slate-700 mb-3">🔧 Debug & Testes</h3>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" onClick={addTestPlayer} className="text-xs">👤 Adicionar Player Teste</Button>
                    <Button variant="outline" size="sm" onClick={simulatePlayerExit} className="text-xs" disabled={!onlineCount}>🚪 Simular Saída de Player</Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* lista de usuários */}
          <div>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="w-5 h-5 text-purple-600" />
                  Participantes
                  <span className="text-sm font-normal text-slate-500">({onlineCount} online)</span>
                </CardTitle>
                <CardDescription>Ranking e status dos participantes</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="max-h-96 overflow-y-auto">
                  {players.sort(sortByScore).map((player, index) => (
                    <div key={player.id} className={`flex items-center justify-between p-4 border-b last:border-b-0 ${!player.active ? 'opacity-60' : ''}`}>
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-slate-500 w-6">#{index + 1}</span>
                          <div className={`w-3 h-3 rounded-full ${player.active ? 'bg-green-400' : 'bg-slate-400'}`} />
                        </div>
                        <div>
                          <p className="font-medium text-slate-900">{player.name}</p>
                          <p className="text-sm text-slate-500">{player.active ? 'Online' : 'Offline'}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Trophy className={`w-4 h-4 ${index === 0 ? 'text-yellow-500' : index === 1 ? 'text-slate-400' : index === 2 ? 'text-orange-600' : 'text-slate-300'}`} />
                        <span className="font-bold text-lg text-slate-900">{player.score}</span>
                        <span className="text-sm text-slate-500">/10</span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* estatísticas */}
        <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card><CardContent className="p-4"><div className="flex items-center justify-between"><div><p className="text-sm font-medium text-slate-600">Total de Participantes</p><p className="text-2xl font-bold text-slate-900">{players.length}</p></div><Users className="w-8 h-8 text-slate-400" /></div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="flex items-center justify-between"><div><p className="text-sm font-medium text-slate-600">Participantes Online</p><p className="text-2xl font-bold text-green-600">{onlineCount}</p></div><div className="w-3 h-3 bg-green-400 rounded-full" /></div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="flex items-center justify-between"><div><p className="text-sm font-medium text-slate-600">Pontuação Média</p><p className="text-2xl font-bold text-blue-600">{avgScore.toFixed(1)}</p></div><Trophy className="w-8 h-8 text-slate-400" /></div></CardContent></Card>
        </div>
      </div>
    </div>
  );
}
