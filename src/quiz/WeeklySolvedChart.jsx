const DAY_LABELS = ["월", "화", "수", "목", "금", "토", "일"];

const getMonday = (date = new Date()) => {
    const d = new Date(date);
    const day = d.getDay(); // 일 0, 월 1 ...
    const diff = day === 0 ? -6 : 1 - day;

    d.setDate(d.getDate() + diff);
    d.setHours(0, 0, 0, 0);

    return d;
};

const toDateKey = (date) => {
    const d = new Date(date);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");

    return `${y}-${m}-${day}`;
};

const getRecordDate = (record) => {
    return (
        record.date ||
        record.createdAt ||
        record.finishedAt ||
        record.timestamp ||
        record.time
    );
};

const getSolvedCount = (record) => {
    return Number(
        record.solvedCount ??
        record.totalQuestions ??
        record.total ??
        record.count ??
        1
    );
};

const buildWeeklySolvedData = (records = []) => {
    const monday = getMonday();

    const week = DAY_LABELS.map((label, index) => {
        const date = new Date(monday);
        date.setDate(monday.getDate() + index);

        return {
            label,
            dateKey: toDateKey(date),
            count: 0,
        };
    });

    records.forEach((record) => {
        const rawDate = getRecordDate(record);
        if (!rawDate) return;

        const dateKey = toDateKey(rawDate);
        const day = week.find((item) => item.dateKey === dateKey);
        if (!day) return;

        day.count += getSolvedCount(record);
    });

    return week;
};

export default function WeeklySolvedChart({ records = [] }) {
    const weekData = buildWeeklySolvedData(records);
    const maxCount = Math.max(...weekData.map((day) => day.count), 1);

    return (
        <section className="quiz-weekly-card">
            <div className="quiz-weekly-header">
                <h3>📊 이번 주 푼 문제 수</h3>
                <span>
                    총 {weekData.reduce((sum, day) => sum + day.count, 0)}문제
                </span>
            </div>

            <div className="quiz-weekly-list">
                {weekData.map((day) => {
                    const width = day.count === 0 ? 0 : Math.max(8, (day.count / maxCount) * 100);

                    return (
                        <div className="quiz-weekly-row" key={day.dateKey}>
                            <span className="quiz-weekly-day">{day.label}</span>

                            <div className="quiz-weekly-track">
                                {day.count > 0 ? (
                                    <div
                                        className="quiz-weekly-fill"
                                        style={{ width: `${width}%` }}
                                    />
                                ) : (
                                    <span className="quiz-weekly-empty">─</span>
                                )}
                            </div>

                            <span className="quiz-weekly-count">
                                {day.count > 0 ? day.count : "─"}
                            </span>
                        </div>
                    );
                })}
            </div>
        </section>
    );
}