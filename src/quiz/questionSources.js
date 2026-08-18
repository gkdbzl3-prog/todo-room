// 레벨이 어느 파일을 쓰는지에 대한 정본. questionBank는 이걸로 로더를 만들고,
// questionCounts 테스트는 이걸로 문항 수를 다시 세어 표와 대조한다. 두 곳이 각자
// 매핑을 들고 있으면 파일을 바꿨을 때 화면의 문항 수만 조용히 옛날 값으로 남는다.
export const levelSources = {
    "jp-basic": { file: "japaneseBasicQuestions.json" },
    "jp-middle": { file: "japaneseMiddleQuestions.json" },
    "jp-advanced": { file: "japaneseN1Questions.json" },

    "zh-basic": { file: "chineseBasicQuestions.json" },
    "zh-middle": { file: "chineseMiddleQuestions.json" },
    "zh-advanced": { file: "chineseAdvanced.json" },

    "history-mixed": { file: "koreanHistoryMixed.json" },
    "history-hangeom": { file: "koreanHistoryHangeomQuestions.json" },
    "history-hangeom-advanced": { file: "koreanHistoryHangeomAdvancedQuestions.json" },
    "history-civil": { file: "koreanHistoryCivilService.json" },

    "toeic-rc": { file: "toeicRcQuestions.json" },

    "admin-basic": { file: "publicAdministration.json" },
    "admin-mixed": { file: "publicAdministration.json" },

    "adminlaw-ox": { file: "adminLawQuestions.json" },
    "adminlaw-multiple": { file: "adminLawQuestions.json" },
    "adminlaw-mixed": { file: "adminLawQuestions.json" },
    "adminlaw-core-ox": { file: "adminLawCoreOxFullQuestions.json" },
    "adminlaw-unexpected-ox": { file: "adminLawUnexpectedOxFullQuestions.json" },

    "sqld-modeling": { file: "sqldQuestions.json" },
    "sqld-sql": { file: "sqldQuestions.json" },
    "sqld-mixed": { file: "sqldQuestions.json" },

    "ncs-communication": {
        file: "ncsQuestions.json",
        topics: ["의사소통능력"],
    },

    "ncs-math": {
        file: "ncsQuestions.json",
        topics: ["수리능력"],
    },

    "ncs-problem": {
        file: "ncsQuestions.json",
        topics: [
            "문제해결능력",
            "자원관리능력",
            "대인관계능력",
            "정보능력",
            "조직이해능력",
            "직업윤리",
            "자기개발능력",
            "NCS OX",
        ],
    },

    "computer-skill": { file: "computerSkillsLevel1Questions.json" },
    "computer-skill(obsidian)": {
        file: "computerSkillsLevel1Questions_vault.json"
    },
};

// 파일마다 통째 배열인 것과 { questions: [...] }인 것이 섞여 있다.
export const readSourceQuestions = (loadedJson, source) => {
    const all = Array.isArray(loadedJson) ? loadedJson : (loadedJson?.questions ?? []);

    return source?.topics ? all.filter((q) => source.topics.includes(q.topic)) : all;
};
