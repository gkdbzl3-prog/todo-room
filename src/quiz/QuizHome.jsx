import { useEffect, useState } from "react";
import { quizSubjects } from "./quizSubjects";
import { getSubjectProgress } from "./questionCounts";
import { loadQuizSummary } from "./quizStore";
import WeeklySolvedChart from "./WeeklySolvedChart";

export default function QuizHome({ onStart, uid }) {
    const pickRandomLevel = (subject = null) => {
        const levels = subject
            ? subject.levels.map((level) => ({ subject, level }))
            : quizSubjects.flatMap((s) => s.levels.map((level) => ({ subject: s, level })));

        const randomItem = levels[Math.floor(Math.random() * levels.length)];
        onStart(randomItem.subject, randomItem.level);
    };

    const [summary, setSummary] = useState(null);
    const [loadingSummary, setLoadingSummary] = useState(false);

    useEffect(() => {
        let ignore = false;

        async function fetchSummary() {
            setLoadingSummary(true);

            try {
                const result = await loadQuizSummary(uid);

                if (!ignore) {
                    setSummary(result);
                }
            } catch (error) {
                console.error("Quiz summary load failed:", error);

                if (!ignore) {
                    setSummary(null);
                }
            } finally {
                if (!ignore) {
                    setLoadingSummary(false);
                }
            }
        }

        fetchSummary();

        return () => {
            ignore = true;
        };
    }, [uid]);

    return (
        <section className="quiz-panel">
            <div className="quiz-head">
                <div>
                    <div className="quiz-kicker">QUIZ ROOM</div>
                    <h2>Today's Quiz</h2>
                </div>

                <button className="quiz-random-btn" onClick={pickRandomLevel}>
                    랜덤 🎲
                </button>
            </div>

            <WeeklySolvedChart records={summary?.recentAttempts ?? []} />

            <div className="quiz-summary-card">
                <div className="summary-item">
                    <span>⭐</span>
                    <strong>{summary?.reward?.stars ?? 0} / 7</strong>
                    <small>현재 별</small>
                </div>

                <div className="summary-item">
                    <span>🎟️</span>
                    <strong>{summary?.reward?.restCoupons ?? 0}장</strong>
                    <small>끈기</small>
                </div>

                <div className="summary-item">
                    <span>📝</span>
                    <strong>{summary?.reward?.yearSolved ?? summary?.reward?.totalSolved ?? 0}개</strong>
                    <small>올해</small>

                </div>
            </div>

            {loadingSummary && <p className="quiz-mini-note">기록 불러오는 중...</p>}
            {summary?.subjectStats?.length > 0 && (
                <div className="quiz-recent-card">
                    <div className="quiz-recent-title">과목별 기록</div>

                    {summary.subjectStats.map((stat) => {
                        const solvedCount = Number(stat.solvedCount || 0);

                        // 과목이 지워졌거나 기록이 옛 과목이면 분모가 없다. 그때는
                        // 푼 개수만 두고 진도율은 아예 빼는 편이 낫다.
                        const progress = getSubjectProgress(stat.subjectId, solvedCount);

                        return (
                            <div className="quiz-recent-row" key={stat.subjectId}>

                                <div>
                                    <strong>{stat.subjectTitle}</strong>
                                    <small>
                                        {stat.lastDateKey
                                            ? `마지막 풀이 ${stat.lastDateKey}`
                                            : "기록 있음"}
                                    </small>
                                </div>

                                <div className="subject-stat-right">
                                    <span>{solvedCount}문제</span>
                                    {progress && (
                                        <small>
                                            {progress.total}문제 중 {progress.percent}%
                                        </small>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            <div className="subject-grid">
                {quizSubjects.map((subject) => (
                    <div className="subject-card" key={subject.id}>
                        <div className="subject-title">
                            <span>{subject.emoji}</span>
                            <strong>{subject.title}</strong>
                            <button
                                className="subject-random-btn"
                                onClick={() => pickRandomLevel(subject)}
                            >
                                🎲
                            </button>
                        </div>

                        <div className="level-list">
                            {subject.levels.map((level) => (
                                <button
                                    key={level.id}
                                    className="level-btn"
                                    onClick={() => onStart(subject, level)}
                                >
                                    <span>{level.label}</span>
                                    <small>{level.desc}</small>
                                </button>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </section>
    );
}