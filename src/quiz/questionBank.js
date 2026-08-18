import { levelSources, readSourceQuestions } from "./questionSources";

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

// 과목 JSON은 static import 하지 않는다. 18개를 전부 번들에 넣으면 한 과목만
// 푸는 사람도 2MB를 내려받게 되므로, 고른 레벨의 파일만 그때 불러온다.
// glob은 파일별로 따로 청크를 만들어 주고, 같은 파일을 여러 레벨이 공유해도
// 모듈 캐시가 잡아주니 재요청은 없다.
const dataModules = import.meta.glob("./data/*.json");

// 네트워크 실패는 삼키지 않고 던진다. 문제를 못 받은 것과 "준비 중인 과목"은
// 사용자에게 전혀 다른 상황이라, 부르는 쪽이 재시도를 띄울 수 있어야 한다.
export const loadQuestionsByLevel = async (levelId) => {
    const source = levelSources[levelId];
    const loadModule = source ? dataModules[`./data/${source.file}`] : null;

    if (!loadModule) return sampleQuestions;

    const module = await loadModule();
    const questions = readSourceQuestions(module.default, source);

    return Array.isArray(questions) && questions.length > 0 ? questions : sampleQuestions;
};
