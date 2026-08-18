// 퀴즈가 기기에만 남기는 기록(본 문제, 완주한 레벨, 오답 노트)이 함께 쓰는 창구.
// 셋 다 "어느 기기에서 풀었든 같아야 할 값"이 아니라서 Firestore로 올리지 않는다.
//
// 사파리 프라이빗 모드는 localStorage에 접근하는 것만으로 던지고, 용량이 차면
// 저장이 던진다. 둘 다 풀이를 멈출 이유는 아니라 여기서 삼키고 기본값을 돌려준다.
const getStorage = () => {
    try {
        if (typeof localStorage === "undefined" || !localStorage) return null;

        return localStorage;
    } catch {
        return null;
    }
};

export const readJson = (storageKey, fallback = null) => {
    const storage = getStorage();

    if (!storage) return fallback;

    try {
        const parsed = JSON.parse(storage.getItem(storageKey) || "null");

        return parsed === null || parsed === undefined ? fallback : parsed;
    } catch {
        return fallback;
    }
};

export const writeJson = (storageKey, value) => {
    const storage = getStorage();

    if (!storage) return;

    try {
        storage.setItem(storageKey, JSON.stringify(value));
    } catch {
        // 저장 실패는 기록이 한 판 늦게 반영된다는 뜻일 뿐이라 풀이를 막지 않는다.
    }
};
