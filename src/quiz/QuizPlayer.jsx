import { useEffect, useMemo, useRef, useState } from "react";
import { loadQuestionsByLevel } from "./questionBank";
import { getQuestionKey, selectRoundQuestions } from "./questionSelection";
import {
    getCycledStorageKey,
    getSeenStorageKey,
    markLevelCycled,
    readCycledLevels,
    readSeenRecord,
    writeSeenRecord,
} from "./seenQuestions";
import {
    addWrongNote,
    countReviewableNotes,
    getWrongStorageKey,
    readWrongNotes,
    removeWrongNote,
    selectReviewQuestions,
} from "./wrongNotes";
import { saveQuizAttempt } from "./quizStore";


const ROUND_SIZE = 5;

export default function QuizPlayer({ subject, level, onExit, uid, nickname, mode = "level" }) {
    // 오답 노트는 이미 기기에 담긴 문제로만 도니까 과목 JSON을 부르지 않는다.
    // 로딩·실패 화면도 지나갈 일이 없고, 한 바퀴라는 개념도 없다.
    const isReview = mode === "review";
    const [index, setIndex] = useState(0);
    const [selected, setSelected] = useState(null);
    const [solved, setSolved] = useState([]);
    const [isFinished, setIsFinished] = useState(false);
    const [roundNo, setRoundNo] = useState(0);

    // 과목 데이터를 고른 뒤에 불러오므로 로딩과 실패라는 상태가 생긴다. loadKey에
    // 시도 횟수를 섞어두면, 재시도할 때 직전 실패 기록이 아직 유효해 보이는 일이 없다.
    const [attempt, setAttempt] = useState(0);
    const [loaded, setLoaded] = useState(null);
    const [loadError, setLoadError] = useState(null);
    const loadKey = `${level?.id ?? ""}#${attempt}`;

    useEffect(() => {
        if (isReview) return undefined;

        let cancelled = false;

        loadQuestionsByLevel(level?.id).then(
            (nextQuestions) => {
                if (!cancelled) setLoaded({ key: loadKey, questions: nextQuestions });
            },
            (error) => {
                console.error("Quiz question load failed:", error);
                if (!cancelled) setLoadError({ key: loadKey });
            }
        );

        return () => {
            cancelled = true;
        };
    }, [loadKey, level?.id, isReview]);

    const sourceQuestions = loaded?.key === loadKey ? loaded.questions : null;
    const hasFailed = loadError?.key === loadKey;

    // 라운드를 뽑는 일에는 "본 문제 기록 갱신"이라는 부수효과가 붙어서 useMemo로는
    // 못 다룬다. StrictMode가 effect를 두 번 돌려도 같은 라운드를 다시 뽑지 않도록
    // 뽑은 라운드 키를 ref로 붙잡아 둔다.
    const [round, setRound] = useState(null);
    const pickedRoundKey = useRef(null);
    const roundKey = `${loadKey}#${roundNo}`;
    const seenStorageKey = getSeenStorageKey(uid, level?.id);
    const cycledStorageKey = getCycledStorageKey(uid);
    const wrongStorageKey = getWrongStorageKey(uid);

    // 복습 라운드는 기기에 있는 오답을 섞기만 하면 끝이라 기다릴 것도, 남길 기록도
    // 없다. effect로 미루면 빈 라운드가 한 번 렌더된 뒤에야 문제가 붙는다. 라운드
    // 키에 묶어 두면 렌더가 여러 번 돌아도 같은 문제가 그대로 남는다.
    const reviewRound = useRef(null);

    if (isReview && reviewRound.current?.key !== roundKey) {
        reviewRound.current = {
            key: roundKey,
            questions: selectReviewQuestions({
                notes: readWrongNotes(wrongStorageKey),
                unlockedLevelIds: readCycledLevels(cycledStorageKey),
                size: ROUND_SIZE,
            }),
            isCycleComplete: false,
            cycleSize: 0,
        };
    }

    useEffect(() => {
        if (isReview || !sourceQuestions || pickedRoundKey.current === roundKey) return;

        const record = readSeenRecord(seenStorageKey);

        const picked = selectRoundQuestions({
            questions: sourceQuestions,
            seenKeys: record.seenKeys,
            recentKeys: record.recentKeys,
            size: ROUND_SIZE,
        });

        writeSeenRecord(seenStorageKey, picked);

        // 완주하면 seenKeys가 그 자리에서 비워져 사실이 사라진다. 오답 노트를 여는
        // 조건이라 여기서 따로 남긴다.
        if (picked.isCycleComplete) markLevelCycled(cycledStorageKey, level?.id);

        pickedRoundKey.current = roundKey;
        setRound({
            key: roundKey,
            questions: picked.questions,
            isCycleComplete: picked.isCycleComplete,
            cycleSize: picked.cycleSize,
        });
    }, [sourceQuestions, roundKey, seenStorageKey, cycledStorageKey, wrongStorageKey, isReview, level?.id]);

    const activeRound = isReview ? reviewRound.current : round;
    const isCurrentRound = activeRound?.key === roundKey;
    const questions = isCurrentRound ? activeRound.questions : [];
    const isCycleComplete = isCurrentRound && Boolean(activeRound.isCycleComplete);
    const cycleSize = isCurrentRound ? activeRound.cycleSize : 0;

    const question = questions[index];
    const [saving, setSaving] = useState(false);
    const [saveResult, setSaveResult] = useState(null);

    const displayTitle = `${subject?.emoji ?? ""} ${subject?.title ?? "퀴즈"}${level?.label ? ` · ${level.label}` : ""
        }`;

    const displayDesc = level?.desc ?? "";

    // 로딩·실패·문제풀이 세 화면이 같은 머리말을 쓴다. 데이터를 기다리는 동안에도
    // 과목 선택으로 돌아갈 수 있어야 하고, 레이아웃이 튀지 않아야 한다.
    const quizHead = (
        <div className="quiz-head">
            <div>
                <button className="quiz-back-btn" onClick={onExit}>
                    ← 과목 선택
                </button>

                <div className="quiz-kicker">QUIZ ROOM</div>
                <h2>{displayTitle}</h2>
                {displayDesc && <p className="quiz-subtitle">{displayDesc}</p>}
            </div>

            <span className="reward-badge">5문제 풀면 ⭐ 별 획득!</span>
        </div>
    );


    const correctCount = useMemo(() => {
        return solved.filter((item) => item.isCorrect).length;
    }, [solved]);

    const solvedCount = solved.length;
    const earnedStars = Math.floor(solvedCount / 5);


    const handleAnswer = (answer) => {
        if (selected) return;

        const isCorrect = answer === question.answer;

        // 맞히면 어느 화면에서 맞혔든 노트에서 뺀다. 오답 노트를 통해서만 지워지면
        // 평소에 맞히게 된 문제가 계속 남는다.
        //
        // 다시 틀렸을 때 addWrongNote가 넘겨받는 subject·level은 복습 라운드에서는
        // 오답 노트의 것이라 원래 과목이 아니다. 이미 있는 문제는 wrongCount만
        // 올리고 원래 기록을 그대로 두므로 레벨이 지워질 일은 없다.
        if (isCorrect) {
            removeWrongNote(wrongStorageKey, getQuestionKey(question));
        } else {
            addWrongNote(wrongStorageKey, { question, subject, level });
        }

        setSelected(answer);
        setSolved((prev) => [
            ...prev,
            {
                questionId: question.id,
                selected: answer,
                answer: question.answer,
                isCorrect,
            },
        ]);
    };

    const [remainingNotes, setRemainingNotes] = useState(0);

    const finishQuiz = async () => {
        if (saving) return;

        setRemainingNotes(
            countReviewableNotes(
                readWrongNotes(wrongStorageKey),
                readCycledLevels(cycledStorageKey)
            )
        );

        setSaving(true);

        try {
            const result = await saveQuizAttempt({
                uid,
                nickname,
                subject,
                level,
                solved,
                correctCount,
                totalCount: questions.length,
                earnedStars,
            });

            setSaveResult(result);
        } catch (error) {
            console.error("Quiz save failed:", error);
            setSaveResult({
                error: true,
                message: "기록 저장에 실패했어요. 그래도 결과는 보실 수 있어요.",
            });
        } finally {
            setSaving(false);
            setIsFinished(true);
        }
    };

    const goNext = () => {
        if (index >= questions.length - 1) {
            finishQuiz();
            return;
        }

        setIndex((prev) => prev + 1);
        setSelected(null);
    };

    const startNextRound = () => {
        setRoundNo((prev) => prev + 1);
        setIndex(0);
        setSelected(null);
        setSolved([]);
        setIsFinished(false);
        setSaveResult(null);
    };

    if (isFinished) {
        return (
            <section className="quiz-panel">
                <div className="quiz-result">
                    <div className="quiz-kicker">RESULT</div>
                    <h2>{displayTitle} 완료 🎉</h2>
                    <p>
                        {questions.length}문제 중{" "}
                        <strong>{correctCount}</strong>개 맞추셨네요!
                    </p>

                    <div className="quiz-score">
                        정답률{" "}
                        {Math.round((correctCount / questions.length) * 100)}%
                    </div>
                    <div className="quiz-reward">
                        ⭐ {earnedStars}개 획득!
                    </div>

                    {isCycleComplete && (
                        <div className="quiz-cycle-done">
                            <strong>🏁 퀴즈가 종료되었습니다</strong>
                            <p>이 과목 {cycleSize}문제를 한 바퀴 다 푸셨어요!</p>
                            <p>계속 풀면 처음부터 다시 나옵니다.</p>

                            {remainingNotes > 0 && (
                                <p className="quiz-note-unlocked">
                                    📕 오답 노트가 열렸어요 — 다시 풀 문제 {remainingNotes}개
                                </p>
                            )}
                        </div>
                    )}

                    {isReview && (
                        <div className="quiz-note-remaining">
                            {remainingNotes > 0
                                ? `📕 오답 노트에 ${remainingNotes}문제 남았어요.`
                                : "📕 오답 노트를 모두 비우셨어요. 훌륭합니다!"}
                        </div>
                    )}

                    {saveResult?.reward && (
                        <div className="quiz-reward-detail">
                            <p>현재 별: ⭐ {saveResult.reward.stars} / 7</p>
                            <p>끈기 쿠폰: 🎟️ {saveResult.reward.restCoupons}장</p>

                            {saveResult.reward.earnedCoupons > 0 && (
                                <strong>🎉 쿠폰 {saveResult.reward.earnedCoupons}장 획득!</strong>
                            )}
                        </div>
                    )}

                    {saveResult?.error && (
                        <div className="quiz-save-error">
                            {saveResult.message}
                        </div>
                    )}

                    {(!isReview || remainingNotes > 0) && (
                        <button className="btn-primary quiz-main-btn" onClick={startNextRound}>
                            {isReview
                                ? "남은 오답 계속 풀기"
                                : isCycleComplete
                                    ? "처음부터 다시 풀기"
                                    : "Keep Going"}
                        </button>
                    )}
                    <button className="quiz-secondary-btn" onClick={onExit}>
                        Back
                    </button>
                </div>
            </section>
        );
    }

    if (hasFailed) {
        return (
            <section className="quiz-panel">
                {quizHead}

                <div className="quiz-card quiz-load-state">
                    <div className="quiz-load-icon" aria-hidden="true">📡</div>
                    <p className="quiz-load-message">문제를 불러오지 못했어요.</p>
                    <p className="quiz-load-sub">연결을 확인하고 다시 시도해 주세요.</p>

                    <button
                        className="btn-primary quiz-main-btn"
                        onClick={() => setAttempt((prev) => prev + 1)}
                    >
                        다시 시도
                    </button>
                </div>
            </section>
        );
    }

    // 복습은 내려받을 것이 없어서 라운드가 비었다면 곧 채워지는 게 아니라 정말로
    // 풀 오답이 없는 것이다. 여기서 잡지 않으면 로딩 화면이 영영 돌아간다.
    if (isReview && isCurrentRound && questions.length === 0) {
        return (
            <section className="quiz-panel">
                {quizHead}

                <div className="quiz-card quiz-load-state">
                    <div className="quiz-load-icon" aria-hidden="true">📕</div>
                    <p className="quiz-load-message">지금 다시 풀 오답이 없어요.</p>
                    <p className="quiz-load-sub">
                        한 레벨을 한 바퀴 다 푸시면 그 레벨에서 틀린 문제가 여기에 열립니다.
                    </p>

                    <button className="btn-primary quiz-main-btn" onClick={onExit}>
                        과목 선택으로
                    </button>
                </div>
            </section>
        );
    }

    if (!question) {
        return (
            <section className="quiz-panel">
                {quizHead}

                <div className="quiz-card quiz-load-state">
                    <div className="quiz-load-spinner" aria-hidden="true" />
                    <p className="quiz-load-message">문제 불러오는 중...</p>
                </div>
            </section>
        );
    }

    return (
        <section className="quiz-panel">
            {quizHead}

            <div className="quiz-card">
                <div className="quiz-topic">{question.topic}</div>
                <p className="quiz-question">{question.question}</p>

                <div className="quiz-actions">
                    {question.choices?.length ? (
                        question.choices.map((choice) => (
                            <button
                                key={choice}
                                className={`quiz-choice-btn ${selected === choice ? "selected" : ""
                                    } ${selected && question.answer === choice ? "correct" : ""
                                    } ${selected === choice && selected !== question.answer ? "wrong" : ""
                                    }`}
                                onClick={() => handleAnswer(choice)}
                            >
                                {choice}
                            </button>
                        ))
                    ) : (
                        <>
                            <button
                                className={`quiz-answer-btn ${selected === "O" ? "selected" : ""
                                    } ${selected && question.answer === "O" ? "correct" : ""
                                    } ${selected === "O" && selected !== question.answer ? "wrong" : ""
                                    }`}
                                onClick={() => handleAnswer("O")}
                            >
                                O
                            </button>

                            <button
                                className={`quiz-answer-btn ${selected === "X" ? "selected" : ""
                                    } ${selected && question.answer === "X" ? "correct" : ""
                                    } ${selected === "X" && selected !== question.answer ? "wrong" : ""
                                    }`}
                                onClick={() => handleAnswer("X")}
                            >
                                X
                            </button>
                        </>
                    )}
                </div>

                {selected && (
                    <div
                        className={`quiz-explanation ${selected === question.answer ? "correct" : "wrong"
                            }`}
                    >
                        <strong>
                            {selected === question.answer ? "정답!" : "아쉽!"}
                        </strong>
                        <p>{question.explanation}</p>
                        <span>{question.sourceLabel}</span>
                    </div>
                )}
            </div>

            <button
                className="btn-primary quiz-main-btn"
                onClick={goNext}
                disabled={!selected || saving}
            >
                {saving
                    ? "저장 중..."
                    : index >= questions.length - 1
                        ? "결과 보기"
                        : "다음 문제"}
            </button>
        </section>
    );
}
