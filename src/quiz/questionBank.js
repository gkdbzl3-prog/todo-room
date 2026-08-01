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

const pickByTopic = (questions, topics) => {
    return questions.filter((q) => topics.includes(q.topic));
};

// 과목 JSON은 static import 하지 않는다. 18개를 전부 번들에 넣으면 한 과목만
// 푸는 사람도 2MB를 내려받게 되므로, 고른 레벨의 파일만 그때 불러온다.
// 같은 파일을 여러 레벨이 공유해도 모듈 캐시가 잡아주니 재요청은 없다.
const loadAdminLaw = () => import("./data/adminLawQuestions.json").then((m) => m.default.questions);
const loadPublicAdministration = () => import("./data/publicAdministration.json").then((m) => m.default);
const loadSqld = () => import("./data/sqldQuestions.json").then((m) => m.default);
const loadNcs = () => import("./data/ncsQuestions.json").then((m) => m.default);

const questionLoaders = {
    "adminlaw-ox": loadAdminLaw,
    "adminlaw-multiple": loadAdminLaw,
    "adminlaw-mixed": loadAdminLaw,

    "adminlaw-core-ox": () => import("./data/adminLawCoreOxFullQuestions.json").then((m) => m.default),
    "adminlaw-unexpected-ox": () => import("./data/adminLawUnexpectedOxFullQuestions.json").then((m) => m.default),

    "admin-basic": loadPublicAdministration,
    "admin-mixed": loadPublicAdministration,

    "toeic-rc": () => import("./data/toeicRcQuestions.json").then((m) => m.default),

    "history-mixed": () => import("./data/koreanHistoryMixed.json").then((m) => m.default),
    "history-hangeom": () => import("./data/koreanHistoryHangeomQuestions.json").then((m) => m.default),
    "history-hangeom-advanced": () => import("./data/koreanHistoryHangeomAdvancedQuestions.json").then((m) => m.default),
    "history-civil": () => import("./data/koreanHistoryCivilService.json").then((m) => m.default),

    "zh-basic": () => import("./data/chineseBasicQuestions.json").then((m) => m.default),
    "zh-middle": () => import("./data/chineseMiddleQuestions.json").then((m) => m.default),
    "zh-advanced": () => import("./data/chineseAdvanced.json").then((m) => m.default),

    "jp-basic": () => import("./data/japaneseBasicQuestions.json").then((m) => m.default),
    "jp-middle": () => import("./data/japaneseMiddleQuestions.json").then((m) => m.default),
    "jp-advanced": () => import("./data/japaneseN1Questions.json").then((m) => m.default),

    "sqld-modeling": loadSqld,
    "sqld-sql": loadSqld,
    "sqld-mixed": loadSqld,

    "ncs-communication": () => loadNcs().then((questions) => pickByTopic(questions, [
        "의사소통능력",
    ])),

    "ncs-math": () => loadNcs().then((questions) => pickByTopic(questions, [
        "수리능력",
    ])),

    "ncs-problem": () => loadNcs().then((questions) => pickByTopic(questions, [
        "문제해결능력",
        "자원관리능력",
        "대인관계능력",
        "정보능력",
        "조직이해능력",
        "직업윤리",
        "자기개발능력",
        "NCS OX",
    ])),

    "computer-skill": () => import("./data/computerSkillsLevel1Questions.json").then((m) => m.default)
};

// 네트워크 실패는 삼키지 않고 던진다. 문제를 못 받은 것과 "준비 중인 과목"은
// 사용자에게 전혀 다른 상황이라, 부르는 쪽이 재시도를 띄울 수 있어야 한다.
export const loadQuestionsByLevel = async (levelId) => {
    const loader = questionLoaders[levelId];

    if (!loader) return sampleQuestions;

    const questions = await loader();

    return Array.isArray(questions) && questions.length > 0 ? questions : sampleQuestions;
};
