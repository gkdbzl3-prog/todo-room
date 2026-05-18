export const quizSubjects = [
    {
        id: "japanese",
        emoji: "📚",
        title: "일본어",
        levels: [
            { id: "jp-basic", label: "초급", desc: "듀오링고 수준 · JLPT N5~N4" },
            { id: "jp-middle", label: "중급", desc: "JLPT N3~N2" },
            { id: "jp-advanced", label: "고급", desc: "JLPT N1" },
        ],
    },
    {
        id: "chinese",
        emoji: "🇨🇳",
        title: "중국어",
        levels: [
            { id: "zh-basic", label: "초급", desc: "HSK 1~2" },
            { id: "zh-middle", label: "중급", desc: "HSK 3~4" },
            { id: "zh-advanced", label: "고급", desc: "HSK 5~6" },
        ],
    },
    {
        id: "history",
        emoji: "🇰🇷",
        title: "한국사",
        levels: [
            { id: "history-mixed", label: "통합전 범위 랜덤", desc: "전 범위 랜덤" },
            { id: "history-hangeom", label: "한능검형", desc: "사료·키워드·시대 흐름" },
            { id: "history-civil", label: "공무원형", desc: "9급 공무원 한국사 스타일" },
        ],
    },
    {
        id: "english",
        emoji: "🇬🇧",
        title: "영어",
        levels: [
            { id: "toeic-rc", label: "토익 RC", desc: "어휘·문법·독해" }
        ],
    },
    {
        id: "admin",
        emoji: "🏛️",
        title: "행정학",
        levels: [
            { id: "admin-basic", label: "기본", desc: "개념·제도·이론" },
            { id: "admin-mixed", label: "통합", desc: "전 범위 랜덤" },
        ],
    },
    {
        id: "adminlaw",
        emoji: "⚖️",
        title: "행정법",
        levels: [
            { id: "adminlaw-ox", label: "OX", desc: "옳은 지문 기반" },
        ],
    },
    {
        id: "sqld",
        emoji: "🗄️",
        title: "SQLD",
        levels: [
            { id: "sqld-modeling", label: "데이터 모델링", desc: "개념·관계·정규화" },
            { id: "sqld-sql", label: "SQL", desc: "SELECT·JOIN·GROUP BY" },
            { id: "sqld-mixed", label: "통합", desc: "전 범위 랜덤" },
        ],
    },
    {
        id: "ncs",
        emoji: "🧩",
        title: "NCS",
        levels: [
            { id: "ncs-communication", label: "의사소통", desc: "문서이해·문장배열" },
            { id: "ncs-math", label: "수리", desc: "자료해석·응용계산" },
            { id: "ncs-problem", label: "문제해결", desc: "추론·상황판단" },
        ],
    },
];