import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  AnswerRecord, AnswerValue, CheckInSession, Category, Question, Slot, SlotPosition,
} from "../data/types";
import { getRecentSessions, saveSession } from "../data/db";
import {
  capLayer2, inferCategory, loadFixedQuestions, pickLayer2Targets,
} from "./questions";
import { buildTodayAnswers, buildWeeklyAverage, generateQuestions } from "./generate";
import { cancelSpeech, speak, unlockSpeech } from "./speech";
import { dateKey, bumpCompletedCount, type Settings } from "./settings";
import { releaseWakeLock, requestWakeLock } from "./wakeLock";

type QueueItem = Question & { layer: 0 | 1 | 2 };

export type SessionPhase = "idle" | "speaking" | "awaiting" | "ended";

/** §7.3 深掘りの終了条件。残りが8秒を切った時点で打ち切る */
const TAIL_CUTOFF_MS = 8000;
/** §S-2 20秒無操作で「無回答」として次の質問へ進む */
const NO_INPUT_MS = 20000;
/** 安全側の上限。固定3問＋深掘り10問 */
const MAX_QUESTIONS = 13;

export interface SessionState {
  phase: SessionPhase;
  question: QueueItem | null;
  answers: AnswerRecord[];
  /** タイマー残量 0..1 */
  remainingRatio: number;
  remainingMs: number;
  session: CheckInSession | null;
  usedFallback: boolean;
  canUndo: boolean;
}

export function useCheckInSession(settings: Settings, slot: Slot) {
  const [phase, setPhase] = useState<SessionPhase>("idle");
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<AnswerRecord[]>([]);
  const [remainingMs, setRemainingMs] = useState(settings.timerSeconds * 1000);
  const [finished, setFinished] = useState<CheckInSession | null>(null);
  const [usedFallback, setUsedFallback] = useState(false);

  const startedAt = useRef(0);
  const speechDoneAt = useRef(0);
  const answersRef = useRef<AnswerRecord[]>([]);
  const queueRef = useRef<QueueItem[]>([]);
  const indexRef = useRef(0);
  const pendingCorrection = useRef(false);
  const speakAbort = useRef<AbortController | null>(null);
  const noInputTimer = useRef<number | null>(null);
  const endedRef = useRef(false);
  const phaseRef = useRef<SessionPhase>("idle");
  const usedFallbackRef = useRef(false);
  const recordRef = useRef<
    (v: AnswerValue | null, g: AnswerRecord["inputGesture"], p: SlotPosition | null) => Promise<void>
  >(async () => {});

  // 先読み生成の受け皿（§7.3 生成タイミング）
  const layer1Promise = useRef<Promise<Question[]> | null>(null);
  const layer2Promise = useRef<Promise<Question[]> | null>(null);
  const layer1Added = useRef(false);
  const layer2Added = useRef(false);
  const genLatency = useRef<number | null>(null);
  const history = useRef<{ recentQuestions: string[]; weeklyAverage: Record<string, number> }>({
    recentQuestions: [],
    weeklyAverage: {},
  });

  answersRef.current = answers;
  queueRef.current = queue;
  indexRef.current = index;
  phaseRef.current = phase;

  const timerTotalMs = settings.timerEnabled ? settings.timerSeconds * 1000 : Infinity;

  /** §7.3 発動条件(v0.1)：夜スロットのみ。朝は固定3問で終了 */
  const deepDiveActive = useMemo(() => {
    if (settings.deepDive === "off") return false;
    if (settings.deepDive === "nightOnly") return slot === "night";
    return true;
  }, [settings.deepDive, slot]);

  const clearNoInput = () => {
    if (noInputTimer.current !== null) {
      clearTimeout(noInputTimer.current);
      noInputTimer.current = null;
    }
  };

  const finalize = useCallback(
    async (endedBy: CheckInSession["endedBy"]) => {
      if (endedRef.current) return;
      endedRef.current = true;
      clearNoInput();
      speakAbort.current?.abort();
      cancelSpeech();
      void releaseWakeLock();

      const now = Date.now();
      const recorded = answersRef.current;
      const session: CheckInSession = {
        id: crypto.randomUUID(),
        date: dateKey(new Date(startedAt.current)),
        slot,
        startedAt: startedAt.current,
        completedAt: endedBy === "abandoned" ? null : now,
        inputMethod: settings.inputMethod,
        screenOffMode: settings.screenOffMode,
        inferredCategory: inferCategory(recorded),
        generationLatencyMs: genLatency.current,
        usedFallback: usedFallbackRef.current,
        endedBy,
        brushDurationMs: now - startedAt.current,
        answers: recorded,
      };
      await saveSession(session);
      if (endedBy !== "abandoned") bumpCompletedCount();
      setFinished(session);
      setPhase("ended");
    },
    [settings.inputMethod, settings.screenOffMode, slot],
  );

  /** 質問を読み上げ、完了後に入力受付を開始する（§S-2 読み上げ中の入力は無視する） */
  const ask = useCallback(
    async (q: QueueItem) => {
      setPhase("speaking");
      speakAbort.current?.abort();
      const ac = new AbortController();
      speakAbort.current = ac;

      if (settings.speechEnabled) {
        await speak(q.text, { rate: settings.speechRate, voiceURI: settings.voiceURI, signal: ac.signal });
      }
      if (ac.signal.aborted || endedRef.current) return;

      speechDoneAt.current = performance.now();
      setPhase("awaiting");
      clearNoInput();
      noInputTimer.current = window.setTimeout(() => {
        // 20秒無操作 → 無回答として次へ
        void recordRef.current(null, "timeout", null);
      }, NO_INPUT_MS);
    },
    [settings.speechEnabled, settings.speechRate, settings.voiceURI],
  );

  const askRef = useRef(ask);
  askRef.current = ask;

  /** 先読み生成のキック（§7.3 生成タイミング） */
  const kickLayer1 = useCallback(() => {
    if (!deepDiveActive || layer1Promise.current) return;
    layer1Promise.current = generateQuestions({
      layer: 1,
      n: 4,
      todayAnswers: buildTodayAnswers(answersRef.current),
      weeklyAverage: history.current.weeklyAverage,
      recentQuestions: history.current.recentQuestions,
    }).then((r) => {
      genLatency.current = Math.round(r.latencyMs);
      if (r.usedFallback) {
        usedFallbackRef.current = true;
        setUsedFallback(true);
      }
      return r.questions;
    });
  }, [deepDiveActive]);

  const kickLayer2 = useCallback(() => {
    if (!deepDiveActive || layer2Promise.current) return;
    const layer1Answers = answersRef.current.filter((a) => a.layer === 1);
    const targets = pickLayer2Targets(layer1Answers);
    // §7.3 該当がなければ第2層は生成せず終了する
    if (targets.length === 0) {
      layer2Promise.current = Promise.resolve([]);
      return;
    }
    layer2Promise.current = generateQuestions({
      layer: 2,
      n: 6,
      todayAnswers: buildTodayAnswers(answersRef.current),
      weeklyAverage: history.current.weeklyAverage,
      recentQuestions: history.current.recentQuestions,
      targetCategories: targets,
      layer1Questions: layer1Answers.map((a) => a.questionText),
    }).then((r) => {
      if (r.usedFallback) {
        usedFallbackRef.current = true;
        setUsedFallback(true);
      }
      return capLayer2(r.questions, targets);
    });
  }, [deepDiveActive]);

  /** 次の質問へ。終了条件は問数ではなく残り時間（§7.3） */
  const advance = useCallback(async () => {
    if (endedRef.current) return;

    const elapsed = Date.now() - startedAt.current;
    const remaining = timerTotalMs - elapsed;
    if (settings.timerEnabled && remaining < TAIL_CUTOFF_MS) {
      await finalize("timer");
      return;
    }
    if (answersRef.current.length >= MAX_QUESTIONS) {
      await finalize("maxQuestions");
      return;
    }

    const next = indexRef.current + 1;
    if (next < queueRef.current.length) {
      setIndex(next);
      void askRef.current(queueRef.current[next]);
      return;
    }

    // キューが尽きた。先読みしておいた層を継ぎ足す
    let appended: QueueItem[] = [];
    if (!layer1Added.current && layer1Promise.current) {
      layer1Added.current = true;
      appended = (await layer1Promise.current).map((q) => ({ ...q, layer: 1 as const }));
    } else if (!layer2Added.current && layer2Promise.current) {
      layer2Added.current = true;
      appended = (await layer2Promise.current).map((q) => ({ ...q, layer: 2 as const }));
    }

    if (endedRef.current) return;
    if (appended.length === 0) {
      // §7.3 第2層の生成が間に合わない/該当なしなら第1層で打ち切る
      await finalize("maxQuestions");
      return;
    }

    const newQueue = [...queueRef.current, ...appended];
    queueRef.current = newQueue;
    setQueue(newQueue);
    setIndex(next);
    void askRef.current(newQueue[next]);
  }, [finalize, settings.timerEnabled, timerTotalMs]);

  /** 回答を記録する */
  const record = useCallback(
    async (value: AnswerValue | null, gesture: AnswerRecord["inputGesture"], position: SlotPosition | null) => {
      if (endedRef.current || phaseRef.current !== "awaiting") return;
      clearNoInput();
      const q = queueRef.current[indexRef.current];
      if (!q) return;

      const rec: AnswerRecord = {
        questionId: q.id,
        questionText: q.text,
        category: q.category,
        isGenerated: q.layer > 0,
        layer: q.layer,
        inputGesture: gesture,
        value,
        latencyMs: Math.round(performance.now() - speechDoneAt.current),
        corrected: pendingCorrection.current,
        order: answersRef.current.length,
        slotPosition: position,
      };
      pendingCorrection.current = false;

      const nextAnswers = [...answersRef.current, rec];
      answersRef.current = nextAnswers;
      setAnswers(nextAnswers);

      // §7.3 固定パート1問目の回答直後に第1層、第1層2問目の回答直後に第2層を生成
      const fixedCount = nextAnswers.filter((a) => a.layer === 0).length;
      const layer1Count = nextAnswers.filter((a) => a.layer === 1).length;
      if (fixedCount === 1) kickLayer1();
      if (layer1Count === 2) kickLayer2();

      await advance();
    },
    [advance, kickLayer1, kickLayer2],
  );

  recordRef.current = record;

  /** §S-2 「戻す」。直前の回答を取り消し、次の回答に corrected を立てる */
  const undo = useCallback(() => {
    if (endedRef.current || answersRef.current.length === 0) return;
    clearNoInput();
    const nextAnswers = answersRef.current.slice(0, -1);
    answersRef.current = nextAnswers;
    setAnswers(nextAnswers);
    pendingCorrection.current = true;
    const prev = Math.max(0, indexRef.current - 1);
    setIndex(prev);
    void askRef.current(queueRef.current[prev]);
  }, []);

  /** 開始。click ハンドラ内から呼ぶこと（§10.3 自動再生制限） */
  const start = useCallback(async () => {
    unlockSpeech();
    endedRef.current = false;
    startedAt.current = Date.now();
    setAnswers([]);
    answersRef.current = [];
    setIndex(0);
    setFinished(null);
    setUsedFallback(false);
    usedFallbackRef.current = false;
    layer1Promise.current = null;
    layer2Promise.current = null;
    layer1Added.current = false;
    layer2Added.current = false;
    genLatency.current = null;

    void requestWakeLock();

    // 生成の入力コンテキスト（§7.3）。直近7日の固定パート平均と出題済み質問
    void getRecentSessions(7).then((recent) => {
      const fixed = recent.flatMap((s) => s.answers.filter((a) => a.layer === 0));
      history.current = {
        weeklyAverage: buildWeeklyAverage(fixed),
        recentQuestions: recent.flatMap((s) => s.answers.filter((a) => a.isGenerated).map((a) => a.questionText)),
      };
    });

    const fixed = await loadFixedQuestions(slot);
    const q0: QueueItem[] = fixed.map((q) => ({ ...q, layer: 0 as const }));
    queueRef.current = q0;
    setQueue(q0);
    setRemainingMs(timerTotalMs);
    void askRef.current(q0[0]);
  }, [slot, timerTotalMs]);

  /** 歯磨きタイマー */
  useEffect(() => {
    if (phase === "idle" || phase === "ended" || !settings.timerEnabled) return;
    const id = window.setInterval(() => {
      const left = timerTotalMs - (Date.now() - startedAt.current);
      setRemainingMs(Math.max(0, left));
      if (left <= 0) void finalize("timer");
    }, 250);
    return () => clearInterval(id);
  }, [phase, settings.timerEnabled, timerTotalMs, finalize]);

  /** 離脱時は abandoned として保存する（記録を落とさない） */
  useEffect(() => {
    return () => {
      clearNoInput();
      speakAbort.current?.abort();
      cancelSpeech();
      void releaseWakeLock();
    };
  }, []);

  const abandon = useCallback(() => finalize("abandoned"), [finalize]);

  const state: SessionState = {
    phase,
    question: queue[index] ?? null,
    answers,
    remainingRatio: settings.timerEnabled ? remainingMs / timerTotalMs : 1,
    remainingMs,
    session: finished,
    usedFallback,
    canUndo: answers.length > 0,
  };

  return { state, start, answer: record, undo, abandon };
}

export type { Category, QueueItem };
