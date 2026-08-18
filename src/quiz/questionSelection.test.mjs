import assert from "node:assert/strict";
import { dedupeQuestions, getQuestionKey, selectRoundQuestions } from "./questionSelection.js";

const ox = (id, question, answer = "O") => ({ id, question, answer, choices: [] });

const multiple = (id, question, choices, answer) => ({ id, question, choices, answer });

const makePool = (count) => Array.from({ length: count }, (_, i) => ox(`q-${i}`, `문제 ${i}`));

const keysOf = (questions) => questions.map(getQuestionKey);

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

    assert.equal(new Set(keysOf(questions)).size, questions.length);
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
    const pool = makePool(12);

    const first = selectRoundQuestions({ questions: pool, size: 5 });
    const second = selectRoundQuestions({
        questions: pool,
        seenKeys: first.seenKeys,
        recentKeys: first.recentKeys,
        size: 5,
    });

    const firstKeys = new Set(keysOf(first.questions));

    assert.deepEqual(second.questions.filter((q) => firstKeys.has(getQuestionKey(q))), []);
    assert.equal(second.seenKeys.length, 10);
}

// 한 바퀴를 끝낸 라운드에서만 완주다. 딱 떨어지게 끝난 다음 라운드는 새 바퀴의
// 첫 라운드일 뿐이라 다시 완주라고 하면 안 된다.
{
    const pool = makePool(10);

    const r1 = selectRoundQuestions({ questions: pool, size: 5 });
    assert.equal(r1.isCycleComplete, false);

    const r2 = selectRoundQuestions({ questions: pool, seenKeys: r1.seenKeys, recentKeys: r1.recentKeys, size: 5 });
    assert.equal(r2.isCycleComplete, true);
    assert.equal(r2.cycleSize, 10);
    assert.deepEqual(r2.seenKeys, []);

    const r3 = selectRoundQuestions({ questions: pool, seenKeys: r2.seenKeys, recentKeys: r2.recentKeys, size: 5 });
    assert.equal(r3.isCycleComplete, false);
}

// 완주 안내는 바퀴 길이(고유 문항 / 5)마다 정확히 한 번씩 나와야 한다. 한 바퀴를
// 끝낸 라운드가 되쓴 문제를 다음 바퀴 기록으로 넘기면 여기서 주기가 짧아진다.
for (const size of [6, 8, 11, 20, 21, 37]) {
    const pool = makePool(size);
    const expectedCycle = Math.ceil(size / 5);

    let record = { seenKeys: [], recentKeys: [] };
    const announced = [];

    for (let roundNo = 1; roundNo <= 40; roundNo += 1) {
        const result = selectRoundQuestions({ questions: pool, ...record, size: 5 });

        assert.equal(new Set(keysOf(result.questions)).size, result.questions.length);

        if (result.isCycleComplete) announced.push(roundNo);

        record = { seenKeys: result.seenKeys, recentKeys: result.recentKeys };
    }

    const gaps = announced.slice(1).map((round, i) => round - announced[i]);

    assert.equal(announced[0], expectedCycle, `고유 ${size}개: 첫 완주 라운드`);
    assert.deepEqual([...new Set(gaps)], [expectedCycle], `고유 ${size}개: 완주 주기`);
}

// 안 본 문제가 라운드를 채우지 못하면 되쓰더라도 5문제를 채우고, 그 안에서 중복은 없다.
{
    const pool = makePool(8);

    const r1 = selectRoundQuestions({ questions: pool, size: 5 });
    const r2 = selectRoundQuestions({ questions: pool, seenKeys: r1.seenKeys, recentKeys: r1.recentKeys, size: 5 });

    assert.equal(r2.questions.length, 5);
    assert.equal(new Set(keysOf(r2.questions)).size, 5);
}

// 고유 문항이 한 라운드보다 적으면 있는 만큼만 내고 매 라운드가 곧 완주다.
{
    const pool = [ox("a", "문제 A"), ox("b", "문제 B"), ox("b2", "문제 B")];
    const { questions, isCycleComplete, cycleSize } = selectRoundQuestions({ questions: pool, size: 5 });

    assert.equal(questions.length, 2);
    assert.equal(isCycleComplete, true);
    assert.equal(cycleSize, 2);
}

// 빈 풀에서도 터지지 않고, 완주라고 하지도 않는다.
{
    const { questions, seenKeys, isCycleComplete } = selectRoundQuestions({ questions: [], size: 5 });

    assert.deepEqual(questions, []);
    assert.deepEqual(seenKeys, []);
    assert.equal(isCycleComplete, false);
}

console.log("questionSelection tests passed");
