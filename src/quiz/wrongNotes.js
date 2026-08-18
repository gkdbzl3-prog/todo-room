// 틀린 문제를 모아 두는 오답 노트. 기기에만 남긴다.
//
// 문제를 통째로 담는다. 기록이 커지긴 하지만, 다시 풀 때 과목 JSON을 새로
// 내려받지 않아도 되고 문제가 지워지거나 고쳐져도 노트는 그대로 풀린다.
import { getQuestionKey, shuffle } from "./questionSelection.js";
import { readJson, writeJson } from "./deviceStorage.js";

const STORAGE_PREFIX = "quiz-wrong";

// 문제 하나가 해설까지 1~2KB쯤 되니 상한 200개면 넉넉잡아 400KB다. localStorage
// 한도(대개 5MB)에 한참 못 미치면서, 다 풀어 없앨 만한 분량이기도 하다.
export const WRONG_NOTE_LIMIT = 200;

const REVIEW_SIZE = 5;

export const getWrongStorageKey = (uid) => `${STORAGE_PREFIX}:${uid || "guest"}`;

const toNote = (value) => {
    if (!value || typeof value !== "object") return null;
    if (typeof value.key !== "string" || !value.question) return null;

    return {
        key: value.key,
        question: value.question,
        subjectId: typeof value.subjectId === "string" ? value.subjectId : "",
        subjectTitle: typeof value.subjectTitle === "string" ? value.subjectTitle : "",
        subjectEmoji: typeof value.subjectEmoji === "string" ? value.subjectEmoji : "",
        levelId: typeof value.levelId === "string" ? value.levelId : "",
        levelLabel: typeof value.levelLabel === "string" ? value.levelLabel : "",
        wrongCount: Number(value.wrongCount) > 0 ? Number(value.wrongCount) : 1,
        updatedAt: Number(value.updatedAt) || 0,
    };
};

export const readWrongNotes = (storageKey) => {
    const parsed = readJson(storageKey);

    if (!Array.isArray(parsed)) return [];

    return parsed.map(toNote).filter(Boolean);
};

// 상한을 넘기면 오래 손대지 않은 것부터 밀어낸다. 다시 틀린 문제는 updatedAt이
// 갱신되므로, 자주 틀리는 문제가 오래됐다는 이유로 빠지는 일은 없다.
const capNotes = (notes) => {
    if (notes.length <= WRONG_NOTE_LIMIT) return notes;

    return [...notes]
        .sort((a, b) => a.updatedAt - b.updatedAt)
        .slice(notes.length - WRONG_NOTE_LIMIT);
};

// 같은 문제가 id만 바꿔 여러 벌 들어있는 과목이 있어서 동일성은 내용으로 판단한다.
// id로 잡으면 같은 문제가 오답 노트에 여러 줄로 쌓인다.
export const addWrongNote = (storageKey, { question, subject, level } = {}) => {
    if (!question) return readWrongNotes(storageKey);

    const key = getQuestionKey(question);
    const notes = readWrongNotes(storageKey);
    const now = Date.now();
    const isKnown = notes.some((note) => note.key === key);

    const next = isKnown
        ? notes.map((note) =>
            note.key === key
                ? { ...note, wrongCount: note.wrongCount + 1, updatedAt: now }
                : note
        )
        : [
            ...notes,
            {
                key,
                question,
                subjectId: subject?.id ?? "",
                subjectTitle: subject?.title ?? "",
                subjectEmoji: subject?.emoji ?? "",
                levelId: level?.id ?? "",
                levelLabel: level?.label ?? "",
                wrongCount: 1,
                updatedAt: now,
            },
        ];

    const capped = capNotes(next);

    writeJson(storageKey, capped);

    return capped;
};

export const removeWrongNote = (storageKey, key) => {
    const notes = readWrongNotes(storageKey);
    const next = notes.filter((note) => note.key !== key);

    // 맞힌 문제가 애초에 노트에 없는 쪽이 훨씬 흔하다. 그때는 쓰지 않는다.
    if (next.length !== notes.length) writeJson(storageKey, next);

    return next;
};

// 오답은 완주 전에도 쌓는다. 완주하는 순간 그 레벨 오답이 이미 다 모여 있어야
// 열자마자 풀 거리가 있기 때문이다. 잠그는 것은 푸는 쪽뿐이다.
const reviewable = (notes, unlockedLevelIds) => {
    const unlocked = new Set(unlockedLevelIds ?? []);

    return (notes ?? []).filter((note) => unlocked.has(note.levelId));
};

export const countReviewableNotes = (notes, unlockedLevelIds) =>
    reviewable(notes, unlockedLevelIds).length;

export const selectReviewQuestions = ({
    notes,
    unlockedLevelIds,
    size = REVIEW_SIZE,
    random = Math.random,
} = {}) =>
    shuffle(reviewable(notes, unlockedLevelIds), random)
        .slice(0, size)
        .map((note) => note.question);
