const ROUND_SIZE = 5;

const normalize = (value) => String(value ?? "").replace(/\s+/g, " ").trim();

// 같은 문제가 id만 다르게 여러 벌 들어있는 과목이 있다(NCS는 200문항 중 고유 55개).
// 그래서 동일성 판단은 id가 아니라 내용으로 한다. 다만 "다음 사건의 순서로 알맞은
// 것은?"처럼 문제문만 같고 선택지가 다른 진짜 별개 문제도 있어서, 선택지와 정답까지
// 묶어야 서로 다른 문제를 잘못 합치지 않는다.
export const getQuestionKey = (question) => {
    const parts = [
        normalize(question?.question),
        (question?.choices ?? []).map(normalize).join("|"),
        normalize(question?.answer),
    ].join("::");

    // 본 문제 목록을 localStorage에 담으므로 원문 대신 짧은 해시를 쓴다(FNV-1a).
    let hash = 0x811c9dc5;

    for (let i = 0; i < parts.length; i += 1) {
        hash ^= parts.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193) >>> 0;
    }

    return hash.toString(16).padStart(8, "0");
};

export const dedupeQuestions = (questions) => {
    const seen = new Set();
    const unique = [];

    for (const question of questions ?? []) {
        const key = getQuestionKey(question);

        if (seen.has(key)) continue;

        seen.add(key);
        unique.push(question);
    }

    return unique;
};

const shuffle = (items, random) => {
    const pool = [...items];

    for (let i = pool.length - 1; i > 0; i -= 1) {
        const j = Math.floor(random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
    }

    return pool;
};

// 기록을 두 개로 나눠 둔다. seenKeys는 "이번 한 바퀴에서 본 문제"라 완주 판정에
// 쓰이고, recentKeys는 "직전 라운드에 나온 문제"라 라운드가 연달아 겹치는 것만 막는다.
// 한 덩어리로 두면, 한 바퀴를 끝낸 라운드가 되쓴 문제까지 다음 바퀴의 기록으로
// 넘겨서 다음 바퀴가 그만큼 짧아지고 완주 안내가 주기보다 자주 뜬다.
const preferring = (questions, avoidKeys, random) => {
    const avoided = [];
    const preferred = [];

    for (const question of questions) {
        (avoidKeys.has(getQuestionKey(question)) ? avoided : preferred).push(question);
    }

    return [...shuffle(preferred, random), ...shuffle(avoided, random)];
};

export const selectRoundQuestions = ({
    questions,
    seenKeys = [],
    recentKeys = [],
    size = ROUND_SIZE,
    random = Math.random,
} = {}) => {
    const pool = dedupeQuestions(questions);
    const seen = new Set(seenKeys);
    const recent = new Set(recentKeys);

    const unseen = pool.filter((question) => !seen.has(getQuestionKey(question)));

    // 이번 라운드가 안 본 문제를 바닥내면 한 바퀴가 끝난 것이다. 남은 게 처음부터
    // 없는 라운드는 없다. 바퀴가 끝나는 즉시 기록을 비워 다음 바퀴를 열기 때문이다.
    const isCycleComplete = unseen.length > 0 && unseen.length <= size;

    const picked = preferring(unseen, recent, random).slice(0, size);

    if (picked.length < size) {
        const pickedKeys = new Set(picked.map(getQuestionKey));
        const rest = pool.filter((question) => !pickedKeys.has(getQuestionKey(question)));

        picked.push(...preferring(rest, recent, random).slice(0, size - picked.length));
    }

    const pickedKeys = picked.map(getQuestionKey);

    return {
        questions: picked,
        seenKeys: isCycleComplete ? [] : [...seenKeys, ...pickedKeys],
        recentKeys: pickedKeys,
        isCycleComplete,
        cycleSize: pool.length,
    };
};
