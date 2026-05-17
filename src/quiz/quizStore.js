import {
    db,
    collection,
    doc,
    getDoc,
    setDoc,
    addDoc,
    getDocs,
    query,
    where,
    limit,
    serverTimestamp,
} from "../firebase";

function getQuizDateKey() {
    const now = new Date();

    // 투두룸이 새벽 2시 기준이라 퀴즈도 맞춰줌
    if (now.getHours() < 2) {
        now.setDate(now.getDate() - 1);
    }

    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
}

function getQuizYearKey() {
    const now = new Date();

    // 새벽 2시 전이면 전날 기준으로 계산
    if (now.getHours() < 2) {
        now.setDate(now.getDate() - 1);
    }

    return String(now.getFullYear());
}

export async function saveQuizAttempt({
    uid,
    nickname,
    subject,
    level,
    solved,
    correctCount,
    totalCount,
    earnedStars,
}) {
    if (!uid) {
        throw new Error("uid가 없어서 퀴즈 기록을 저장할 수 없어.");
    }

    const safeNickname = nickname || "익명";
    const dateKey = getQuizDateKey();

    const attemptPayload = {
        uid,
        nickname: safeNickname,

        subjectId: subject?.id || "",
        subjectTitle: subject?.title || "퀴즈",
        levelId: level?.id || "",
        levelLabel: level?.label || "",

        dateKey,
        solvedCount: solved.length,
        correctCount,
        totalCount,
        earnedStars,

        answers: solved,
        createdAt: serverTimestamp(),
    };

    await addDoc(collection(db, "quizAttempts"), attemptPayload);

    const rewardRef = doc(db, "quizRewards", uid);
    const rewardSnap = await getDoc(rewardRef);
    const prevReward = rewardSnap.exists() ? rewardSnap.data() : {};

    const currentYearKey = getQuizYearKey();
    const prevYearKey = prevReward.yearKey;

    const isNewYear = prevYearKey && prevYearKey !== currentYearKey;

    const prevStars = isNewYear ? 0 : Number(prevReward.stars || 0);
    const prevCoupons = isNewYear ? 0 : Number(prevReward.restCoupons || 0);

    const prevYearSolved = isNewYear ? 0 : Number(prevReward.yearSolved || prevReward.totalSolved || 0);
    const prevYearCorrect = isNewYear ? 0 : Number(prevReward.yearCorrect || prevReward.totalCorrect || 0);

    const prevLifetimeSolved = Number(prevReward.lifetimeSolved || prevReward.totalSolved || 0);
    const prevLifetimeCorrect = Number(prevReward.lifetimeCorrect || prevReward.totalCorrect || 0);

    let nextStars = prevStars + earnedStars;
    let nextCoupons = prevCoupons;

    // 별 7개마다 "오늘은 쉬어도 됨" 쿠폰 1장
    const earnedCoupons = Math.floor(nextStars / 7);

    if (earnedCoupons > 0) {
        nextCoupons += earnedCoupons;
        nextStars = nextStars % 7;
    }

    const rewardPayload = {
        uid,
        nickname: safeNickname,

        // 시즌 기준
        yearKey: currentYearKey,
        stars: nextStars,
        restCoupons: nextCoupons,
        yearSolved: prevYearSolved + solved.length,
        yearCorrect: prevYearCorrect + correctCount,

        // 전체 누적 기록
        lifetimeSolved: prevLifetimeSolved + solved.length,
        lifetimeCorrect: prevLifetimeCorrect + correctCount,

        updatedAt: serverTimestamp(),
    };

    await setDoc(rewardRef, rewardPayload, { merge: true });

    return {
        attempt: attemptPayload,
        reward: {
            ...rewardPayload,
            earnedCoupons,
        },
    };
}

export async function loadQuizSummary(uid) {
    if (!uid) {
        return {
            reward: {
                stars: 0,
                restCoupons: 0,
                yearSolved: 0,
                yearCorrect: 0,
                lifetimeSolved: 0,
                lifetimeCorrect: 0,
            },
            subjectStats: [],
        };
    }

    const rewardRef = doc(db, "quizRewards", uid);
    const rewardSnap = await getDoc(rewardRef);

    const reward = rewardSnap.exists()
        ? rewardSnap.data()
        : {
            stars: 0,
            restCoupons: 0,
            yearSolved: 0,
            yearCorrect: 0,
            lifetimeSolved: 0,
            lifetimeCorrect: 0,
        };

    const attemptsQuery = query(
        collection(db, "quizAttempts"),
        where("uid", "==", uid)
    );

    const attemptsSnap = await getDocs(attemptsQuery);

    const subjectMap = new Map();

    attemptsSnap.docs.forEach((docSnap) => {
        const attempt = docSnap.data();

        const subjectId = attempt.subjectId || "unknown";
        const subjectTitle = attempt.subjectTitle || "기타";
        const solvedCount = Number(attempt.solvedCount || attempt.totalCount || 0);
        const correctCount = Number(attempt.correctCount || 0);

        // 0문제 기록은 표시 안 함
        if (solvedCount <= 0) return;

        const prev = subjectMap.get(subjectId) || {
            subjectId,
            subjectTitle,
            solvedCount: 0,
            correctCount: 0,
            sessionCount: 0,
            lastDateKey: "",
            lastTime: 0,
        };

        const createdSeconds = attempt.createdAt?.seconds || 0;

        subjectMap.set(subjectId, {
            ...prev,
            solvedCount: prev.solvedCount + solvedCount,
            correctCount: prev.correctCount + correctCount,
            sessionCount: prev.sessionCount + 1,
            lastDateKey:
                createdSeconds >= prev.lastTime
                    ? attempt.dateKey || prev.lastDateKey
                    : prev.lastDateKey,
            lastTime: Math.max(prev.lastTime, createdSeconds),
        });
    });

    const subjectStats = Array.from(subjectMap.values())
        .filter((item) => item.solvedCount > 0)
        .sort((a, b) => b.lastTime - a.lastTime);

    const recentAttempts = attemptsSnap.docs.map((docSnap) => {
        const d = docSnap.data();
        return {
            date: d.dateKey,
            solvedCount: Number(d.solvedCount || d.totalCount || 0),
        };
    });

    return {
        reward,
        subjectStats,
        recentAttempts,
    };
}