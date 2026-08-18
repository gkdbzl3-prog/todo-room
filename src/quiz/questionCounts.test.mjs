import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { getQuestionKey } from "./questionSelection.js";
import { levelSources, readSourceQuestions } from "./questionSources.js";
import { getSubjectProgress, getSubjectQuestionTotal, subjectQuestionCounts } from "./questionCounts.js";
import { quizSubjects } from "./quizSubjects.js";

const dataDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "data");

const readLevelQuestions = (levelId) => {
    const source = levelSources[levelId];

    assert.ok(source, `${levelId}: levelSources에 출처가 없다`);

    const json = JSON.parse(fs.readFileSync(path.join(dataDir, source.file), "utf8"));

    return readSourceQuestions(json, source);
};

// 화면에 쓰는 문항 수는 실제 JSON에서 다시 센 값과 같아야 한다. 문제를 넣거나 빼면
// 여기서 실패하므로 진도율 분모가 옛날 값으로 남지 않는다.
for (const subject of quizSubjects) {
    const keys = new Set();

    for (const level of subject.levels) {
        for (const question of readLevelQuestions(level.id)) {
            keys.add(getQuestionKey(question));
        }
    }

    assert.equal(
        getSubjectQuestionTotal(subject.id),
        keys.size,
        `${subject.title}: questionCounts를 ${keys.size}로 고쳐야 한다`
    );
}

// 표에 남은 유령 과목이 없어야 한다.
{
    const subjectIds = new Set(quizSubjects.map((subject) => subject.id));

    for (const id of Object.keys(subjectQuestionCounts)) {
        assert.ok(subjectIds.has(id), `${id}: quizSubjects에 없는 과목이 표에 남아 있다`);
    }
}

// 모든 레벨은 실제로 존재하는 파일에서 문제를 얻어야 한다.
for (const subject of quizSubjects) {
    for (const level of subject.levels) {
        assert.ok(readLevelQuestions(level.id).length > 0, `${level.id}: 문제가 비어 있다`);
    }
}

// 진도율은 푼 수 대비 과목 문항 수이고, 다시 푼 기록 때문에 100%를 넘지 않는다.
{
    assert.deepEqual(getSubjectProgress("computer", 30), { total: 175, percent: 17 });
    assert.deepEqual(getSubjectProgress("computer", 0), { total: 175, percent: 0 });
    assert.deepEqual(getSubjectProgress("computer", 500), { total: 175, percent: 100 });
    assert.equal(getSubjectProgress("unknown", 10), null);
}

console.log("questionCounts tests passed");
