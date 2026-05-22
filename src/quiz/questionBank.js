import adminlawSource from "./data/adminLawQuestions.json";
import koreanHistoryMixedQuestions from "./data/koreanHistoryMixed.json";
import koreanHistoryCivilServiceQuestions from "./data/koreanHistoryCivilService.json";
import publicAdministrationQuestions from "./data/publicAdministration.json";
import sqldQuestions from "./data/sqldQuestions.json";
import toeicRcQuestions from "./data/toeicRcQuestions.json";
import japaneseBasicQuestions from "./data/japaneseBasicQuestions.json";
import japaneseN1Questions from "./data/japaneseN1Questions.json";
import ncsQuestions from "./data/ncsQuestions.json";
import chineseBasicQuestions from "./data/chineseBasicQuestions.json";
import chineseMiddleQuestions from "./data/chineseMiddleQuestions.json";
import chineseAdvancedQuestions from "./data/chineseAdvanced.json";
import japaneseMiddleQuestions from "./data/japaneseMiddleQuestions.json";
import koreanHistoryHangeomQuestions from "./data/koreanHistoryHangeomQuestions.json";
import koreanHistoryHangeomAdvancedQuestions from "./data/koreanHistoryHangeomAdvancedQuestions.json";
import adminLawCoreOxQuestions from "./data/adminLawCoreOxQuestionsRaw.json";
import adminLawUnexpectedOxQuestions from "./data/adminLawUnexpectedOxQuestionsRaw.json";

const sampleQuestions = [
    {
        id: "sample-001",
        subject: "샘플",
        topic: "준비 중",
        type: "multiple",
        question: "이 과목은 아직 문제를 준비 중이야.",
        choices: ["확인", "패스"],
        answer: "확인",
        explanation: "문제 JSON을 붙이면 실제 문제가 나와.",
        sourceLabel: "SAMPLE"
    }
];

const adminlawQuestions = adminlawSource.questions;

const pickByTopic = (questions, topics) => {
    return questions.filter((q) => topics.includes(q.topic));
};

const getQuestionText = (q) => {
    return [
        q.topic,
        q.question,
        q.explanation,
        q.sourceLabel,
        ...(q.choices || []),
    ]
        .filter(Boolean)
        .join(" ");
};

const hasAnyKeyword = (text, keywords) => {
    return keywords.some((keyword) => text.includes(keyword));
};


export const questionBank = {
    "adminlaw-ox": adminlawQuestions,
    "adminlaw-multiple": adminlawQuestions,
    "adminlaw-mixed": adminlawQuestions,

    "adminlaw-core-ox": adminLawCoreOxQuestions,
    "adminlaw-unexpected-ox": adminLawUnexpectedOxQuestions,
    "admin-basic": publicAdministrationQuestions,

    "admin-mixed": publicAdministrationQuestions,

    "toeic-rc": toeicRcQuestions,

    "history-mixed": koreanHistoryMixedQuestions,
    "history-hangeom": koreanHistoryHangeomQuestions,
    "history-hangeom-advanced": koreanHistoryHangeomAdvancedQuestions,
    "history-civil": koreanHistoryCivilServiceQuestions,

    "zh-basic": chineseBasicQuestions,
    "zh-middle": chineseMiddleQuestions,
    "zh-advanced": chineseAdvancedQuestions,

    "jp-basic": japaneseBasicQuestions,
    "jp-middle": japaneseMiddleQuestions,
    "jp-advanced": japaneseN1Questions,

    "sqld-modeling": sqldQuestions,
    "sqld-sql": sqldQuestions,
    "sqld-mixed": sqldQuestions,

    "ncs-communication": pickByTopic(ncsQuestions, [
        "의사소통능력",
    ]),

    "ncs-math": pickByTopic(ncsQuestions, [
        "수리능력",
    ]),

    "ncs-problem": pickByTopic(ncsQuestions, [
        "문제해결능력",
        "자원관리능력",
        "대인관계능력",
        "정보능력",
        "조직이해능력",
        "직업윤리",
        "자기개발능력",
        "NCS OX",
    ]),
};

export const getQuestionsByLevel = (levelId) => {
    const questions = questionBank[levelId];

    return Array.isArray(questions) && questions.length > 0 ? questions : sampleQuestions;
};
