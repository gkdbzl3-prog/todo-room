import { useEffect, useMemo, useRef, useState } from "react";
import { loadQuestionsByLevel } from "./questionBank";
import { selectRoundQuestions } from "./questionSelection";
import { getSeenStorageKey, readSeenKeys, writeSeenKeys } from "./seenQuestions";
import { saveQuizAttempt } from "./quizStore";


const ROUND_SIZE = 5;

export default function QuizPlayer({ subject, level, onExit, uid, nickname }) {
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
    }, [loadKey, level?.id]);

    const sourceQuestions = loaded?.key === loadKey ? loaded.questions : null;
    const hasFailed = loadError?.key === loadKey;

    // 라운드를 뽑는 일에는 "본 문제 기록 갱신"이라는 부수효과가 붙어서 useMemo로는
    // 못 다룬다. StrictMode가 effect를 두 번 돌려도 같은 라운드를 다시 뽑지 않도록
    // 뽑은 라운드 키를 ref로 붙잡아 둔다.
    const [round, setRound] = useState(null);
    const pickedRoundKey = useRef(null);
    const roundKey = `${loadKey}#${roundNo}`;
    const seenStorageKey = getSeenStorageKey(uid, level?.id);

    useEffect(() => {
        if (!sourceQuestions || pickedRoundKey.current === roundKey) return;

        const picked = selectRoundQuestions({
            questions: sourceQuestions,
            seenKeys: readSeenKeys(seenStorageKey),
            size: ROUND_SIZE,
        });

        writeSeenKeys(seenStorageKey, picked.seenKeys);
        pickedRoundKey.current = roundKey;
        setRound({ key: roundKey, questions: picked.questions });
    }, [sourceQuestions, roundKey, seenStorageKey]);

    const questions = round?.key === roundKey ? round.questions : [];

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

    const finishQuiz = async () => {
        if (saving) return;

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
                message: "기록 저장에 실패했어. 그래도 결과는 볼 수 있어.",
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

                    <button className="btn-primary quiz-main-btn" onClick={startNextRound}>
                        Keep Going
                    </button>
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
                    <p className="quiz-load-message">문제를 불러오지 못했어.</p>
                    <p className="quiz-load-sub">연결을 확인하고 다시 시도해줘.</p>

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
