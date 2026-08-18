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

// 안 본 문제로 먼저 채우고, 모자라면 그때 한 바퀴를 끝낸 것으로 보고 기록을 비운다.
// 리셋한 라운드에서도 방금 뽑은 문제는 다시 뽑지 않으므로 한 라운드 안 중복은 없다.
export const selectRoundQuestions = ({
    questions,
    seenKeys = [],
    size = ROUND_SIZE,
    random = Math.random,
} = {}) => {
    const pool = dedupeQuestions(questions);
    const seen = new Set(seenKeys);

    const unseen = pool.filter((question) => !seen.has(getQuestionKey(question)));
    const picked = shuffle(unseen, random).slice(0, size);

    let carriedKeys = seenKeys;

    if (picked.length < size) {
        const pickedKeys = new Set(picked.map(getQuestionKey));
        const rest = pool.filter((question) => !pickedKeys.has(getQuestionKey(question)));

        picked.push(...shuffle(rest, random).slice(0, size - picked.length));
        carriedKeys = [];
    }

    return {
        questions: picked,
        seenKeys: [...carriedKeys, ...picked.map(getQuestionKey)],
    };
};
