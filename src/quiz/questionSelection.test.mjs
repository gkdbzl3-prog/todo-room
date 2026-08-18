import assert from "node:assert/strict";
import { dedupeQuestions, getQuestionKey, selectRoundQuestions } from "./questionSelection.js";

const ox = (id, question, answer = "O") => ({ id, question, answer, choices: [] });

const multiple = (id, question, choices, answer) => ({ id, question, choices, answer });

// 문제 데이터에는 같은 문항이 id만 바꿔 여러 벌 들어있다. id가 달라도 한 라운드에
// 같은 문제가 두 번 나오면 안 된다.
{
    const pool = [
        ox("ncs-101", "40,000원에서 10% 할인하면?", "36,000원"),
        ox("ncs-106", "40,000원에서 10% 할인하면?", "36,000원"),
        ox("ncs-111", "40,000원에서 10% 할인하면?", "36,000원"),
        ox("ncs-102", "5개에 75,000원이면 1개는?", "15,000원"),
    ];

    assert.equal(dedupeQuestions(pool).length, 2);

    const { questions } = selectRoundQuestions({ questions: pool, size: 5 });
    const keys = questions.map(getQuestionKey);

    assert.equal(new Set(keys).size, keys.length);
}

// 문제문만 같고 선택지·정답이 다른 문항은 서로 다른 문제다. 합쳐버리면 안 된다.
{
    const pool = [
        multiple("h-1", "다음 사건의 순서로 알맞은 것은?", ["가", "나"], "가"),
        multiple("h-2", "다음 사건의 순서로 알맞은 것은?", ["다", "라"], "다"),
    ];

    assert.equal(dedupeQuestions(pool).length, 2);
}

// 다음 라운드는 앞 라운드에서 본 문제를 빼고 뽑는다.
{
    const pool = Array.from({ length: 12 }, (_, i) => ox(`q-${i}`, `문제 ${i}`));

    const first = selectRoundQuestions({ questions: pool, size: 5 });
    const second = selectRoundQuestions({ questions: pool, seenKeys: first.seenKeys, size: 5 });

    const firstKeys = new Set(first.questions.map(getQuestionKey));
    const overlap = second.questions.filter((q) => firstKeys.has(getQuestionKey(q)));

    assert.deepEqual(overlap, []);
    assert.equal(second.seenKeys.length, 10);
}

// 안 본 문제가 라운드를 채울 만큼 남지 않으면 한 바퀴를 끝낸 것으로 보고 기록을
// 비운다. 그래도 이번 라운드 안에서는 중복이 없어야 한다.
{
    const pool = Array.from({ length: 8 }, (_, i) => ox(`q-${i}`, `문제 ${i}`));

    const first = selectRoundQuestions({ questions: pool, size: 5 });
    const second = selectRoundQuestions({ questions: pool, seenKeys: first.seenKeys, size: 5 });

    assert.equal(second.questions.length, 5);

    const keys = second.questions.map(getQuestionKey);

    assert.equal(new Set(keys).size, 5);
    assert.deepEqual(second.seenKeys, keys);
}

// 고유 문항이 라운드 크기보다 적은 과목은 있는 만큼만 낸다(무한 루프·빈 화면 금지).
{
    const pool = [
        ox("a", "문제 A"),
        ox("b", "문제 B"),
        ox("b2", "문제 B"),
    ];

    const { questions, seenKeys } = selectRoundQuestions({ questions: pool, size: 5 });

    assert.equal(questions.length, 2);
    assert.equal(seenKeys.length, 2);
}

// 빈 풀에서도 터지지 않는다.
{
    const { questions, seenKeys } = selectRoundQuestions({ questions: [], size: 5 });

    assert.deepEqual(questions, []);
    assert.deepEqual(seenKeys, []);
}

console.log("questionSelection tests passed");
