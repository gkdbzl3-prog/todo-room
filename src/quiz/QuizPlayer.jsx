import { useMemo, useState } from "react";
import { getQuestionsByLevel } from "./questionBank";
import { saveQuizAttempt } from "./quizStore";


const ROUND_SIZE = 5;

function pickRandomQuestions(questionList, size = ROUND_SIZE) {
    const pool = [...(questionList ?? [])];

    for (let i = pool.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
    }

    return pool.slice(0, Math.min(size, pool.length));
}

export default function QuizPlayer({ subject, level, onExit, uid, nickname }) {
    const [index, setIndex] = useState(0);
    const [selected, setSelected] = useState(null);
    const [solved, setSolved] = useState([]);
    const [isFinished, setIsFinished] = useState(false);
    const [roundNo, setRoundNo] = useState(0);
    const sourceQuestions = getQuestionsByLevel(level?.id);

    const questions = useMemo(() => {
        return pickRandomQuestions(sourceQuestions, ROUND_SIZE);
    }, [level?.id, roundNo]);

    const question = questions[index];
    const [saving, setSaving] = useState(false);
    const [saveResult, setSaveResult] = useState(null);

    const displayTitle = `${subject?.emoji ?? ""} ${subject?.title ?? "퀴즈"}${level?.label ? ` · ${level.label}` : ""
        }`;

    const displayDesc = level?.desc ?? "";


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

    return (
        <section className="quiz-panel">
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
