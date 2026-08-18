// 본 문제 기록은 기기에만 남긴다. 어느 기기에서 풀었든 같아야 할 값이 아니고,
// Firestore로 옮기면 라운드마다 읽기·쓰기가 한 번씩 더 붙는다.
const STORAGE_PREFIX = "quiz-seen";

export const getSeenStorageKey = (uid, levelId) => `${STORAGE_PREFIX}:${uid || "guest"}:${levelId || ""}`;

const getStorage = () => {
    try {
        return typeof localStorage === "undefined" ? null : localStorage;
    } catch {
        // 사파리 프라이빗 모드 등에서 접근 자체가 던진다.
        return null;
    }
};

export const readSeenKeys = (storageKey) => {
    const storage = getStorage();

    if (!storage) return [];

    try {
        const parsed = JSON.parse(storage.getItem(storageKey) || "[]");

        return Array.isArray(parsed) ? parsed.filter((key) => typeof key === "string") : [];
    } catch {
        return [];
    }
};

export const writeSeenKeys = (storageKey, seenKeys) => {
    const storage = getStorage();

    if (!storage) return;

    try {
        storage.setItem(storageKey, JSON.stringify(seenKeys));
    } catch {
        // 저장 실패는 중복이 다시 나올 수 있다는 뜻일 뿐이라 풀이를 막지 않는다.
    }
};
