import assert from "node:assert/strict";
import { getQuestionKey, selectRoundQuestions } from "./questionSelection.js";
import {
    addWrongNote,
    countReviewableNotes,
    getWrongStorageKey,
    readWrongNotes,
    removeWrongNote,
    selectReviewQuestions,
    WRONG_NOTE_LIMIT,
} from "./wrongNotes.js";
import {
    getCycledStorageKey,
    getSeenStorageKey,
    markLevelCycled,
    readCycledLevels,
    readSeenRecord,
    writeSeenRecord,
} from "./seenQuestions.js";

const installStorage = (impl) => {
    Object.defineProperty(globalThis, "localStorage", {
        value: impl,
        configurable: true,
        writable: true,
    });
};

const makeStorage = () => {
    const map = new Map();

    return {
        getItem: (key) => (map.has(key) ? map.get(key) : null),
        setItem: (key, value) => {
            map.set(key, String(value));
        },
        removeItem: (key) => {
            map.delete(key);
        },
    };
};

const ox = (id, question, answer = "O") => ({ id, question, answer, choices: [] });

const subject = { id: "history", title: "한국사", emoji: "🛖" };
const level = { id: "history-mixed", label: "통합전 범위 랜덤" };

const noteArgs = (question, over = {}) => ({
    question,
    subject,
    level,
    ...over,
});

const KEY = getWrongStorageKey("nal");
const CYCLED = getCycledStorageKey("nal");

// 틀린 문제는 본문까지 통째로 남는다. 다시 풀 때 과목 JSON을 새로 내려받지 않기 위해서다.
{
    installStorage(makeStorage());

    const question = ox("h-1", "훈민정음은 세종이 만들었다.");
    addWrongNote(KEY, noteArgs(question));

    const notes = readWrongNotes(KEY);

    assert.equal(notes.length, 1);
    assert.equal(notes[0].key, getQuestionKey(question));
    assert.equal(notes[0].question.question, "훈민정음은 세종이 만들었다.");
    assert.equal(notes[0].subjectId, "history");
    assert.equal(notes[0].levelId, "history-mixed");
    assert.equal(notes[0].wrongCount, 1);
}

// 같은 문제를 또 틀려도 줄이 늘지 않는다. id만 다른 같은 문제도 마찬가지여야 한다.
// 문항 JSON에는 같은 문제가 id를 바꿔 여러 벌 들어있기 때문이다.
{
    installStorage(makeStorage());

    addWrongNote(KEY, noteArgs(ox("h-1", "훈민정음은 세종이 만들었다.")));
    addWrongNote(KEY, noteArgs(ox("h-1", "훈민정음은 세종이 만들었다.")));
    addWrongNote(KEY, noteArgs(ox("h-99", "훈민정음은 세종이 만들었다.")));

    const notes = readWrongNotes(KEY);

    assert.equal(notes.length, 1);
    assert.equal(notes[0].wrongCount, 3);
}

// 맞히면 노트에서 빠진다. 오답 노트 밖에서 맞혀도 마찬가지다.
{
    installStorage(makeStorage());

    const question = ox("h-1", "훈민정음은 세종이 만들었다.");
    addWrongNote(KEY, noteArgs(question));
    addWrongNote(KEY, noteArgs(ox("h-2", "고려는 918년에 건국되었다.")));

    removeWrongNote(KEY, getQuestionKey(question));

    const notes = readWrongNotes(KEY);

    assert.equal(notes.length, 1);
    assert.equal(notes[0].question.question, "고려는 918년에 건국되었다.");
}

// 없는 문제를 지워도 조용히 넘어간다.
{
    installStorage(makeStorage());

    addWrongNote(KEY, noteArgs(ox("h-1", "훈민정음은 세종이 만들었다.")));
    removeWrongNote(KEY, "deadbeef");

    assert.equal(readWrongNotes(KEY).length, 1);
}

// localStorage가 통째로 막힌 기기에서도 풀이가 멈추면 안 된다.
{
    installStorage(null);

    assert.doesNotThrow(() => addWrongNote(KEY, noteArgs(ox("h-1", "문제"))));
    assert.deepEqual(readWrongNotes(KEY), []);
    assert.doesNotThrow(() => removeWrongNote(KEY, "whatever"));
}

// 저장이 던져도(사파리 프라이빗 모드 등) 마찬가지다.
{
    installStorage({
        getItem: () => null,
        setItem: () => {
            throw new Error("QuotaExceeded");
        },
        removeItem: () => { },
    });

    assert.doesNotThrow(() => addWrongNote(KEY, noteArgs(ox("h-1", "문제"))));
}

// 깨진 값이 들어있어도 빈 노트로 읽는다.
{
    installStorage(makeStorage());
    localStorage.setItem(KEY, "{not json");

    assert.deepEqual(readWrongNotes(KEY), []);
}

// 상한을 넘기면 오래된 것부터 밀려난다. 최신 오답이 남아야 한다.
{
    installStorage(makeStorage());

    for (let i = 0; i < WRONG_NOTE_LIMIT + 10; i += 1) {
        addWrongNote(KEY, noteArgs(ox(`h-${i}`, `문제 ${i}`)));
    }

    const notes = readWrongNotes(KEY);

    assert.equal(notes.length, WRONG_NOTE_LIMIT);
    assert.ok(notes.some((note) => note.question.question === `문제 ${WRONG_NOTE_LIMIT + 9}`));
    assert.ok(!notes.some((note) => note.question.question === "문제 0"));
}

// 완주 기록: 완주한 레벨만 쌓이고, 같은 레벨을 두 번 완주해도 한 줄이다.
{
    installStorage(makeStorage());

    assert.deepEqual(readCycledLevels(CYCLED), []);

    markLevelCycled(CYCLED, "history-mixed");
    markLevelCycled(CYCLED, "history-mixed");
    markLevelCycled(CYCLED, "jp-basic");

    assert.deepEqual(readCycledLevels(CYCLED).sort(), ["history-mixed", "jp-basic"]);
}

// 레벨 id가 없으면 기록하지 않는다.
{
    installStorage(makeStorage());

    markLevelCycled(CYCLED, "");
    markLevelCycled(CYCLED, null);

    assert.deepEqual(readCycledLevels(CYCLED), []);
}

// 오답은 완주 전에도 쌓인다. 다만 잠긴 레벨의 오답은 출제되지 않는다.
// 완주하는 순간 그 레벨 오답이 이미 모여 있어야 열자마자 풀 거리가 있다.
{
    installStorage(makeStorage());

    addWrongNote(KEY, noteArgs(ox("h-1", "한국사 문제"), {
        subject: { id: "history", title: "한국사", emoji: "🛖" },
        level: { id: "history-mixed", label: "통합" },
    }));

    addWrongNote(KEY, noteArgs(ox("j-1", "일본어 문제"), {
        subject: { id: "japanese", title: "일본어", emoji: "🍙" },
        level: { id: "jp-basic", label: "초급" },
    }));

    const notes = readWrongNotes(KEY);

    assert.equal(notes.length, 2);
    assert.equal(countReviewableNotes(notes, []), 0);
    assert.equal(countReviewableNotes(notes, ["jp-basic"]), 1);
    assert.equal(countReviewableNotes(notes, ["jp-basic", "history-mixed"]), 2);

    const locked = selectReviewQuestions({ notes, unlockedLevelIds: [] });
    assert.equal(locked.length, 0);

    const opened = selectReviewQuestions({ notes, unlockedLevelIds: ["jp-basic"] });
    assert.equal(opened.length, 1);
    assert.equal(opened[0].question, "일본어 문제");
}

// 복습 라운드는 5문제까지, 모자라면 있는 만큼만 낸다. 한 라운드에 같은 문제가 두 번 나오면 안 된다.
{
    installStorage(makeStorage());

    for (let i = 0; i < 12; i += 1) {
        addWrongNote(KEY, noteArgs(ox(`h-${i}`, `문제 ${i}`)));
    }

    const notes = readWrongNotes(KEY);
    const picked = selectReviewQuestions({
        notes,
        unlockedLevelIds: ["history-mixed"],
        size: 5,
    });

    assert.equal(picked.length, 5);
    assert.equal(new Set(picked.map(getQuestionKey)).size, 5);

    const short = selectReviewQuestions({
        notes: notes.slice(0, 3),
        unlockedLevelIds: ["history-mixed"],
        size: 5,
    });

    assert.equal(short.length, 3);
}

// QuizPlayer가 실제로 하는 순서를 그대로 돌려 본다. 모듈 하나하나가 맞아도
// 맞물리는 지점(완주 기록 시점, 해금 전 수집)이 어긋나면 오답 노트가 영영 안 열린다.
{
    installStorage(makeStorage());

    const jp = { id: "japanese", title: "일본어", emoji: "🍙" };
    const jpLevel = { id: "jp-basic", label: "초급" };
    const seenKey = getSeenStorageKey("nal", jpLevel.id);
    const pool = Array.from({ length: 12 }, (_, i) => ox(`jp-${i}`, `일본어 문제 ${i}`));

    let cycled = false;
    let rounds = 0;

    while (!cycled && rounds < 20) {
        const record = readSeenRecord(seenKey);
        const picked = selectRoundQuestions({
            questions: pool,
            seenKeys: record.seenKeys,
            recentKeys: record.recentKeys,
            size: 5,
        });

        writeSeenRecord(seenKey, picked);

        // QuizPlayer는 라운드를 뽑는 자리에서 완주를 기록한다. 그 라운드를 풀며 나온
        // 오답까지 노트에 담긴 채로 결과 화면이 열려야 하기 때문이다.
        if (picked.isCycleComplete) {
            markLevelCycled(CYCLED, jpLevel.id);
            cycled = true;
        }

        picked.questions.forEach((question, i) => {
            if (i % 2 === 0) {
                addWrongNote(KEY, { question, subject: jp, level: jpLevel });
            } else {
                removeWrongNote(KEY, getQuestionKey(question));
            }
        });

        rounds += 1;
    }

    assert.ok(cycled, "12문항 레벨이면 세 라운드 안에 완주해야 한다");

    const unlocked = readCycledLevels(CYCLED);
    const notes = readWrongNotes(KEY);

    assert.deepEqual(unlocked, ["jp-basic"]);
    assert.ok(notes.length > 0, "완주 전에 틀린 문제도 노트에 남아 있어야 한다");
    assert.equal(countReviewableNotes(notes, unlocked), notes.length);

    // 복습에서 다 맞히면 노트가 비워진다.
    let left = readWrongNotes(KEY);

    while (left.length > 0) {
        const picked = selectReviewQuestions({
            notes: left,
            unlockedLevelIds: unlocked,
            size: 5,
        });

        assert.ok(picked.length > 0, "열린 레벨의 오답은 반드시 출제되어야 한다");
        picked.forEach((question) => removeWrongNote(KEY, getQuestionKey(question)));
        left = readWrongNotes(KEY);
    }

    assert.equal(countReviewableNotes(readWrongNotes(KEY), unlocked), 0);
}

console.log("wrongNotes: all assertions passed");
