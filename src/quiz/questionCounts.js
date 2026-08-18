// 과목이 가진 고유 문항 수. 진도율의 분모로만 쓰는 값이라 화면에서 JSON 18개를
// 전부 내려받게 만들 이유가 없어, 세어 둔 결과만 들고 있다. 문제를 더 넣거나 빼면
// questionCounts.test.mjs가 실제 파일을 다시 세어 여기와 다르면 실패한다.
//
// 같은 과목 안에서 레벨끼리 문제가 겹치면 한 번만 센다. 행정학 두 레벨과 SQLD 세
// 레벨은 같은 파일을 공유해서 200개, 199개이지 400개, 597개가 아니다.
export const subjectQuestionCounts = {
    japanese: 418,
    chinese: 508,
    history: 734,
    english: 169,
    admin: 200,
    adminlaw: 512,
    sqld: 199,
    ncs: 115,
    computer: 75,
};

export const getSubjectQuestionTotal = (subjectId) => subjectQuestionCounts[subjectId] ?? 0;

// 같은 문제를 다시 풀어도 풀이 기록은 그대로 쌓이므로 100%를 넘을 수 있다.
export const getSubjectProgress = (subjectId, solvedCount) => {
    const total = getSubjectQuestionTotal(subjectId);

    if (total <= 0) return null;

    return {
        total,
        percent: Math.min(100, Math.round((Number(solvedCount || 0) / total) * 100)),
    };
};
