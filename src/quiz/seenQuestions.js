// 본 문제와 완주한 레벨은 기기에만 남긴다. 어느 기기에서 풀었든 같아야 할 값이
// 아니고, Firestore로 옮기면 라운드마다 읽기·쓰기가 한 번씩 더 붙는다.
import { readJson, writeJson } from "./deviceStorage.js";

const STORAGE_PREFIX = "quiz-seen";
const CYCLED_PREFIX = "quiz-cycled";

export const getSeenStorageKey = (uid, levelId) => `${STORAGE_PREFIX}:${uid || "guest"}:${levelId || ""}`;

export const getCycledStorageKey = (uid) => `${CYCLED_PREFIX}:${uid || "guest"}`;

const toKeyList = (value) => (Array.isArray(value) ? value.filter((key) => typeof key === "string") : []);

const emptyRecord = { seenKeys: [], recentKeys: [] };

export const readSeenRecord = (storageKey) => {
    const parsed = readJson(storageKey);

    // 먼저 나간 판은 배열 하나만 저장했다. 그건 이번 바퀴 기록으로 읽어준다.
    if (Array.isArray(parsed)) return { seenKeys: toKeyList(parsed), recentKeys: [] };

    if (!parsed || typeof parsed !== "object") return emptyRecord;

    return {
        seenKeys: toKeyList(parsed.seenKeys),
        recentKeys: toKeyList(parsed.recentKeys),
    };
};

export const writeSeenRecord = (storageKey, { seenKeys, recentKeys }) => {
    writeJson(storageKey, { seenKeys, recentKeys });
};

// 한 바퀴를 끝내면 seenKeys는 그 자리에서 비워져 다음 바퀴가 열린다. 그래서
// "이 레벨을 완주했다"는 사실은 라운드 결과에만 잠깐 떴다 사라진다. 오답 노트는
// 완주를 해금 조건으로 쓰므로 완주한 레벨을 따로 남겨야 한다.
export const readCycledLevels = (storageKey) => toKeyList(readJson(storageKey));

export const markLevelCycled = (storageKey, levelId) => {
    const levels = readCycledLevels(storageKey);

    if (!levelId || levels.includes(levelId)) return levels;

    const next = [...levels, levelId];

    writeJson(storageKey, next);

    return next;
};
