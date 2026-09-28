// 추가 시나리오 — choice·score 중심, 문자열·배열 state, 세 타입을 한 번에 묻는 예제.
// scenarios.js 뒤에 로드되어 window.SCENARIOS 에 이어 붙는다.
(() => {
  const act = (action, tone) => ({ action, tone });

  window.SCENARIOS.push(
    // ───────────── 분류 (choice) ─────────────
    {
      id: "doc-type",
      cat: "문서·텍스트",
      title: "문서 종류 분류",
      blurb: "업로드된 문서의 첫 부분만 보고 어떤 서류인지 분류해 처리 파이프라인을 고른다. state 가 문자열이다.",
      rule: "확신 70% 이상이면 해당 파이프라인 · 아니면 사람이 분류",
      gauge: { q: "doc_type", thresholds: [0.7] },
      questions: {
        doc_type: {
          type: "choice",
          instructions: "이 문서는 어떤 종류의 서류인가?",
          criteria: {
            invoice: "세금계산서·청구서 (공급자가 대금을 청구)",
            receipt: "영수증 (이미 결제된 내역)",
            contract: "계약서 (당사자 간 권리·의무)",
            resume: "이력서·경력기술서",
            other: "그 밖의 문서",
          },
        },
      },
      decide: (a) => (a.doc_type.confidence >= 0.7 ? act(`${a.doc_type.choice} 파이프라인`, "ok") : act("사람이 분류", "warn")),
      samples: [
        { label: "세금계산서", expect: "invoice 파이프라인", state: "전자세금계산서\n공급자: (주)한빛소프트 123-45-67890\n공급받는자: (주)누리상사\n작성일자 2026-09-25 / 공급가액 3,000,000 / 세액 300,000 / 합계 3,300,000\n품목: 클라우드 서버 유지보수 (9월분)" },
        { label: "카페 영수증", expect: "receipt 파이프라인", state: "블루빈 커피 강남점\n2026-09-27 14:32\n아메리카노(ICE) 2 x 4,500\n카페라떼 1 x 5,000\n합계 14,000원 / 신용카드 승인 번호 83920112" },
        { label: "경력기술서", expect: "resume 파이프라인", state: "김하늘 | 백엔드 개발자 | 경력 6년\n2021–현재 (주)페이코어 — 결제 API 설계, 초당 3천 건 처리 구조 개선\n2019–2021 (주)스몰샵 — 주문 시스템 개발\n기술: Kotlin, Spring Boot, PostgreSQL, Kafka" },
      ],
    },
    {
      id: "sentiment",
      cat: "문서·텍스트",
      title: "감정 분류 (영어)",
      blurb: "영어 SNS 게시물의 감정을 셋 중 하나로 고른다. Jev 가 가장 잘하는 언어로 비교해 보는 예제다.",
      rule: "negative 확신 60% 이상이면 대응 큐 · 그 밖은 집계만",
      gauge: { q: "sentiment", thresholds: [0.6] },
      questions: {
        sentiment: {
          type: "choice",
          instructions: "What is the author's overall sentiment toward the brand in this post?",
          criteria: {
            positive: "Satisfied, praising, recommending",
            neutral: "Factual, question, or mixed without a clear lean",
            negative: "Complaining, angry, disappointed, or warning others",
          },
        },
      },
      decide: (a) => (a.sentiment.choice === "negative" && a.sentiment.confidence >= 0.6 ? act("대응 큐", "warn") : act(`집계만 (${a.sentiment.choice})`, "ok")),
      samples: [
        { label: "칭찬", expect: "집계만 (positive)", state: "Just switched to @AcmeBank and their app is ridiculously smooth. Opened an account in 4 minutes. Why didn't I do this sooner?" },
        { label: "단순 질문", expect: "집계만 (neutral)", state: "Does @AcmeBank support Apple Pay in Canada yet? Can't find it in the FAQ." },
        { label: "비꼬는 불만", expect: "대응 큐", state: "Love how @AcmeBank locks my card every time I buy coffee abroad. Truly world-class fraud detection. Third call this week 🙃" },
      ],
    },
    {
      id: "language",
      cat: "문서·텍스트",
      title: "언어 감지",
      blurb: "입력 텍스트의 주 언어를 골라 번역·검색 파이프라인을 정한다. 섞인 언어와 짧은 입력이 까다롭다.",
      rule: "확신 80% 이상이면 해당 언어 처리 · 아니면 다국어 처리",
      gauge: { q: "lang", thresholds: [0.8] },
      questions: {
        lang: {
          type: "choice",
          instructions: "이 텍스트의 주 언어는?",
          criteria: { ko: "한국어", en: "영어", ja: "일본어", zh: "중국어", mixed: "두 언어 이상이 비슷한 비중으로 섞임" },
        },
      },
      decide: (a) => (a.lang.confidence >= 0.8 ? act(`${a.lang.choice} 처리`, "ok") : act("다국어 처리", "warn")),
      samples: [
        { label: "일본어 문의", expect: "ja 처리", state: "注文した商品がまだ届いていません。追跡番号を教えていただけますか。" },
        { label: "중국어 리뷰", expect: "zh 처리", state: "物流很快，包装也很好，但是颜色和图片有点不一样。" },
        { label: "한영 혼용 (애매)", expect: "다국어 처리", state: "내일 standup 에서 Q4 roadmap review 하고 deadline confirm 할게요" },
      ],
    },
    {
      id: "assistant-intent",
      cat: "고객 지원",
      title: "음성 비서 의도 분류",
      blurb: "음성 인식 결과 한 줄을 받아 어떤 기능을 실행할지 고른다. 확신이 낮으면 되묻는다.",
      rule: "확신 70% 이상이면 해당 기능 실행 · 아니면 되묻기",
      gauge: { q: "intent", thresholds: [0.7] },
      questions: {
        intent: {
          type: "choice",
          instructions: "사용자가 음성 비서에게 원하는 기능은?",
          criteria: {
            alarm: "알람·타이머 설정",
            weather: "날씨 조회",
            music: "음악 재생·정지",
            call: "전화 걸기",
            navigation: "길 안내",
            unknown: "위 기능 중 무엇인지 알 수 없음",
          },
        },
      },
      decide: (a) => (a.intent.confidence >= 0.7 && a.intent.choice !== "unknown" ? act(`${a.intent.choice} 실행`, "ok") : act("되묻기", "warn")),
      samples: [
        { label: "알람", expect: "alarm 실행", state: { transcript: "내일 아침 여섯 시 반에 깨워줘" } },
        { label: "돌려 말한 날씨", expect: "weather 실행", state: { transcript: "오늘 우산 챙겨야 돼?" } },
        { label: "모호한 발화", expect: "되묻기", state: { transcript: "엄마한테 그거 좀 해줘" } },
      ],
    },
    {
      id: "assignee",
      cat: "비즈니스·운영",
      title: "담당자 추천",
      blurb: "보기(criteria)에 팀원과 담당 영역을 적어 두고, 새 이슈를 누구에게 줄지 고른다. 보기를 바꿔 우리 팀으로 시험해 볼 수 있다.",
      rule: "확신 60% 이상이면 자동 배정 · 아니면 팀 리드가 배정",
      gauge: { q: "owner", thresholds: [0.6] },
      questions: {
        owner: {
          type: "choice",
          instructions: "이 이슈를 가장 잘 처리할 담당자는?",
          criteria: {
            minji: "민지 — 결제·정산, PG 연동",
            junho: "준호 — iOS·Android 앱",
            sora: "소라 — 인프라·배포·모니터링",
            taeyang: "태양 — 검색·추천",
          },
        },
      },
      decide: (a) => (a.owner.confidence >= 0.6 ? act(`${a.owner.choice} 에게 배정`, "ok") : act("팀 리드가 배정", "warn")),
      samples: [
        { label: "결제 승인 실패", expect: "minji 에게 배정", state: { title: "특정 카드사 결제 승인이 간헐적으로 실패", detail: "KB카드만 오후 시간대에 승인 거절 코드 051 이 늘었습니다." } },
        { label: "배포 파이프라인 실패", expect: "sora 에게 배정", state: { title: "main 배포가 헬스체크에서 멈춤", detail: "새 이미지가 readiness probe 를 통과하지 못해 롤아웃이 30분째 대기 중입니다." } },
        { label: "안드로이드 앱에서만 검색 이상", expect: "junho 에게 배정", state: { title: "앱에서 검색하면 결과가 비어 보임", detail: "안드로이드 앱에서만 검색 결과 화면이 빈 채로 뜹니다. 웹은 정상입니다." } },
      ],
    },
    {
      id: "sql-risk",
      cat: "LLM·에이전트 운영",
      title: "SQL 실행 전 분류",
      blurb: "Text-to-SQL 에이전트가 만든 쿼리를 실행 전에 분류해, 읽기만 자동 실행하고 나머지는 막거나 묻는다.",
      rule: "read 는 실행 · write 는 사용자 확인 · schema·destructive 는 차단",
      gauge: { q: "kind", thresholds: [0.5] },
      questions: {
        kind: {
          type: "choice",
          instructions: "`state.sql` 을 실행하면 데이터베이스에 무슨 일이 일어나는가?",
          criteria: {
            read: "조회만 한다 (SELECT)",
            write: "일부 행을 추가·수정한다 (조건이 있는 INSERT·UPDATE)",
            schema: "테이블·인덱스 구조를 바꾼다 (ALTER·CREATE·DROP INDEX)",
            destructive: "대량 삭제·전체 수정·테이블 삭제 (조건 없는 DELETE/UPDATE, DROP TABLE, TRUNCATE)",
          },
        },
      },
      decide: (a) => {
        const c = a.kind.choice;
        return c === "read" ? act("실행", "ok") : c === "write" ? act("사용자 확인", "warn") : act("차단", "crit");
      },
      samples: [
        { label: "집계 조회", expect: "실행", state: { sql: "SELECT region, SUM(amount) FROM orders WHERE created_at >= '2026-09-01' GROUP BY region;" } },
        { label: "조건 있는 수정", expect: "사용자 확인", state: { sql: "UPDATE users SET plan = 'pro' WHERE id = 48213;" } },
        { label: "WHERE 빠진 삭제", expect: "차단", state: { sql: "DELETE FROM sessions;" } },
      ],
    },
    {
      id: "product-category",
      cat: "비즈니스·운영",
      title: "상품 카테고리 매핑",
      blurb: "판매자가 올린 상품명을 쇼핑몰 카테고리에 넣는다. 상품명이 짧고 광고 문구가 섞여 있다.",
      rule: "확신 70% 이상 자동 등록 · 아니면 검수 대기",
      gauge: { q: "category", thresholds: [0.7] },
      questions: {
        category: {
          type: "choice",
          instructions: "이 상품이 속할 카테고리는?",
          criteria: {
            fashion: "의류·신발·가방",
            beauty: "화장품·향수·헤어",
            digital: "전자기기·액세서리",
            food: "식품·음료",
            home: "가구·주방·생활용품",
            sports: "스포츠·아웃도어",
          },
        },
      },
      decide: (a) => (a.category.confidence >= 0.7 ? act(`${a.category.choice} 등록`, "ok") : act("검수 대기", "warn")),
      samples: [
        { label: "무선 이어폰", expect: "digital 등록", state: { title: "[무료배송] 노이즈캔슬링 블루투스 이어폰 V5.3 초경량 화이트" } },
        { label: "캠핑 의자", expect: "sports 등록", state: { title: "초경량 캠핑 릴렉스 체어 접이식 백패킹 의자 수납가방 포함" } },
        { label: "텀블러 (주방? 스포츠?)", expect: "home 등록", state: { title: "스테인리스 진공 텀블러 600ml 보온보냉 커피 머그" } },
      ],
    },

    // ───────────── 점수 (score) ─────────────
    {
      id: "translation-grade",
      cat: "문서·텍스트",
      title: "번역 품질 채점",
      blurb: "원문과 기계 번역을 함께 넘겨 0~3 점으로 채점하고, 낮으면 사람 번역가에게 넘긴다.",
      rule: "점수 2.5 이상 게시 · 1.5~2.5 가벼운 교정 · 그 아래 재번역",
      gauge: { q: "quality", thresholds: [1.5, 2.5], range: [0, 3] },
      questions: {
        quality: {
          type: "score",
          instructions: "`state.translation` 은 `state.source` 를 얼마나 정확하고 자연스럽게 옮겼는가? 의미 누락·오역을 가장 크게 본다.",
          criteria: [
            "0: 핵심 의미가 틀렸거나 빠짐",
            "1: 뜻은 대체로 통하지만 오역이 있음",
            "2: 정확하지만 어색한 표현이 있음",
            "3: 정확하고 자연스러움",
          ],
        },
      },
      decide: (a) => {
        const s = a.quality.score;
        return s >= 2.5 ? act("게시", "ok") : s >= 1.5 ? act("가벼운 교정", "warn") : act("재번역", "crit");
      },
      samples: [
        { label: "정확하고 자연스러움", expect: "게시", state: { source: "Your order has shipped and should arrive within 2–3 business days.", translation: "주문하신 상품이 발송되었으며 영업일 기준 2~3일 안에 도착할 예정입니다." } },
        { label: "부정이 뒤집힘", expect: "재번역", state: { source: "Do not unplug the device while the update is in progress.", translation: "업데이트가 진행되는 동안 기기의 전원을 뽑아 주세요." } },
        { label: "직역투", expect: "가벼운 교정", state: { source: "Please feel free to reach out if you have any questions.", translation: "당신이 어떤 질문이라도 가지고 있다면 자유롭게 연락을 뻗어 주세요." } },
      ],
    },
    {
      id: "clickbait",
      cat: "문서·텍스트",
      title: "낚시성 제목 정도",
      blurb: "기사 제목과 본문 첫 문단을 비교해 제목이 얼마나 과장·낚시성인지 0~3 점으로 매긴다.",
      rule: "점수 1.5 이상 추천 피드에서 제외 · 0.5~1.5 노출 낮춤 · 그 아래 정상",
      gauge: { q: "bait", thresholds: [0.5, 1.5], range: [0, 3] },
      questions: {
        bait: {
          type: "score",
          instructions: "`state.headline` 이 `state.lead`(본문 첫 문단)에 비해 얼마나 과장되었거나 호기심만 자극하는가?",
          criteria: [
            "0: 제목이 본문 내용을 정확히 요약",
            "1: 약간 자극적이지만 내용과 맞음",
            "2: 핵심을 감추고 호기심을 자극하거나 과장함",
            "3: 본문과 다른 내용을 암시하는 낚시 제목",
          ],
        },
      },
      decide: (a) => {
        const s = a.bait.score;
        return s >= 1.5 ? act("추천 피드에서 제외", "crit") : s >= 0.5 ? act("노출 낮춤", "warn") : act("정상", "ok");
      },
      samples: [
        { label: "정직한 제목", expect: "정상", state: { headline: "한국은행, 기준금리 3.25% 동결", lead: "한국은행 금융통화위원회는 28일 기준금리를 연 3.25%로 동결했다. 물가 상승률 둔화에도 가계부채 증가세를 고려했다." } },
        { label: "\"충격\" 제목", expect: "추천 피드에서 제외", state: { headline: "\"이것\" 먹으면 큰일 난다… 의사들도 경악한 충격 음식", lead: "영양 전문가들은 가공육을 과다 섭취하면 건강에 좋지 않을 수 있다고 조언했다." } },
        { label: "살짝 자극적", expect: "노출 낮춤", state: { headline: "전기차 판매 '급브레이크'… 업계 비상", lead: "3분기 국내 전기차 판매량은 전년 동기 대비 8% 감소했다. 업계는 보조금 축소를 원인으로 꼽았다." } },
      ],
    },
    {
      id: "readability",
      cat: "문서·텍스트",
      title: "읽기 난이도",
      blurb: "고객 안내문이 일반인이 읽기에 얼마나 어려운지 0~3 점으로 매겨, 어려우면 쉽게 다시 쓰게 한다. state 가 문자열이다.",
      rule: "점수 1.5 이상 쉽게 다시 쓰기 · 그 아래 그대로 발송",
      gauge: { q: "difficulty", thresholds: [1.5], range: [0, 3] },
      questions: {
        difficulty: {
          type: "score",
          instructions: "전문 지식이 없는 일반 고객이 이 안내문을 한 번 읽고 이해하기가 얼마나 어려운가? 전문 용어, 긴 문장, 수동태, 조건의 중첩을 본다.",
          criteria: ["0: 누구나 바로 이해", "1: 조금 생각하면 이해", "2: 용어·문장 구조 때문에 여러 번 읽어야 함", "3: 전문가가 아니면 이해하기 어려움"],
        },
      },
      decide: (a) => (a.difficulty.score >= 1.5 ? act("쉽게 다시 쓰기", "warn") : act("그대로 발송", "ok")),
      samples: [
        { label: "쉬운 안내", expect: "그대로 발송", state: "내일(9월 29일) 새벽 2시부터 4시까지 앱 점검이 있어요. 이 시간에는 로그인이 안 되니 미리 볼일을 마쳐 주세요." },
        { label: "약관체", expect: "쉽게 다시 쓰기", state: "본 서비스의 이용과 관련하여 회원의 귀책사유로 인하여 발생한 손해에 대하여 회사는 관계 법령이 정하는 범위 내에서 그 책임이 면제되며, 다만 회사의 고의 또는 중과실이 있는 경우에는 그러하지 아니한다." },
        { label: "보험 약관 용어", expect: "쉽게 다시 쓰기", state: "해당 특약의 보장개시일은 제1회 보험료 납입일로부터 90일이 경과한 날의 다음 날로 하며, 갱신계약의 경우 면책기간을 적용하지 않습니다." },
      ],
    },
    {
      id: "story-clarity",
      cat: "비즈니스·운영",
      title: "요구사항 명확성",
      blurb: "기획서의 사용자 스토리가 개발에 들어갈 만큼 구체적인지 0~3 점으로 매긴다.",
      rule: "점수 1.5 이상 스프린트 투입 · 0.5~1.5 질문 목록 작성 · 그 아래 기획 반려",
      gauge: { q: "clarity", thresholds: [0.5, 1.5], range: [0, 3] },
      questions: {
        clarity: {
          type: "score",
          instructions: "이 사용자 스토리가 개발자가 추가 질문 없이 구현·테스트할 수 있을 만큼 구체적인가? 대상 사용자, 기대 동작, 완료 조건(수용 기준), 예외 처리를 본다.",
          criteria: [
            "0: 무엇을 만들지 알 수 없음",
            "1: 목표는 있으나 동작·완료 조건이 없음",
            "2: 동작과 완료 조건이 있으나 예외가 빠짐",
            "3: 대상·동작·수용 기준·예외가 모두 있음",
          ],
        },
      },
      decide: (a) => {
        const s = a.clarity.score;
        return s >= 1.5 ? act("스프린트 투입", "ok") : s >= 0.5 ? act("질문 목록 작성", "warn") : act("기획 반려", "crit");
      },
      samples: [
        { label: "한 줄 요청", expect: "기획 반려", state: { story: "앱을 더 편하게 만들어 주세요." } },
        { label: "목표만 있음", expect: "질문 목록 작성", state: { story: "사용자로서 비밀번호를 잊었을 때 다시 설정할 수 있으면 좋겠다." } },
        {
          label: "수용 기준까지 있음",
          expect: "스프린트 투입",
          state: {
            story: "회원으로서 비밀번호를 잊었을 때 이메일로 재설정 링크를 받고 싶다.",
            acceptance: ["로그인 화면에 '비밀번호 찾기' 링크", "가입 이메일로 30분간 유효한 링크 발송", "만료·재사용된 링크는 안내 문구와 재발송 버튼", "가입되지 않은 이메일도 같은 안내(계정 존재 노출 방지)"],
          },
        },
      ],
    },

    // ───────────── 배열 state · 세 타입 동시 ─────────────
    {
      id: "thread-decision",
      cat: "문서·텍스트",
      title: "대화 스레드 결정 사항 감지",
      blurb: "메신저 스레드 전체(배열)를 넘겨, 회의록으로 남길 결정 사항이 나왔는지 본다. state 가 배열이다.",
      rule: "결정 확률 60% 이상 요약해 회의록에 기록 · 그 아래 넘어감",
      gauge: { q: "decided", thresholds: [0.6] },
      questions: {
        decided: {
          type: "noul",
          instructions: "이 대화에서 참여자들이 무언가를 최종 결정했는가? 제안만 하거나 의견을 나누다 끝났으면 false. 한 사람이 정리하고 다른 사람이 동의했거나, 권한 있는 사람이 확정했으면 true.",
          criteria: { true: "일정·방식·담당 등이 확정되었다.", false: "논의·제안·질문만 오갔다." },
        },
      },
      decide: (a) => (a.decided.noul >= 0.6 ? act("회의록에 기록", "ok") : act("넘어감", "ok")),
      samples: [
        {
          label: "확정됨",
          expect: "회의록에 기록",
          state: [
            { from: "지은", text: "출시일 10/15 vs 10/22 어떻게 할까요?" },
            { from: "현우", text: "QA 일정 보면 22일이 안전해 보여요" },
            { from: "팀장 수진", text: "그럼 10/22 로 확정합시다. 마케팅팀에도 공유해 주세요." },
            { from: "지은", text: "넵 공유하겠습니다" },
          ],
        },
        {
          label: "의견만 오감",
          expect: "넘어감",
          state: [
            { from: "지은", text: "로고 색 좀 더 밝게 하면 어떨까요?" },
            { from: "현우", text: "저는 지금도 괜찮은 것 같아요" },
            { from: "민재", text: "다음 주 디자인 리뷰 때 다시 얘기해 봐요" },
          ],
        },
        {
          label: "농담처럼 흘러간 결정 (애매)",
          expect: "회의록에 기록",
          state: [
            { from: "현우", text: "금요일 배포 또 해요? ㅋㅋ" },
            { from: "민재", text: "이번엔 진짜 목요일에 합시다" },
            { from: "팀장 수진", text: "ㅇㅋ 앞으로 배포는 목요일 오후로 고정~ 금요일 배포 금지" },
          ],
        },
      ],
    },
    {
      id: "app-review-triage",
      cat: "고객 지원",
      title: "앱 리뷰 트리아지",
      blurb: "한 번의 요청에 noul·choice·score 세 질문을 함께 보내, 버그 여부·영역·심각도를 동시에 받는다. 세 타입의 응답 형식을 한 화면에서 비교하기 좋다.",
      rule: "버그 확률 50% 이상이고 심각도 1.5 이상이면 온콜 · 버그면 백로그 · 아니면 CS 답변",
      gauge: { q: "severity", thresholds: [1.5], range: [0, 3] },
      questions: {
        is_bug: {
          type: "noul",
          instructions: "이 리뷰가 앱의 오작동(버그)을 보고하는가? 기능 요청, 가격 불만, 칭찬은 버그가 아니다.",
          criteria: { true: "앱이 의도대로 동작하지 않는다고 말한다.", false: "요청·의견·칭찬·가격 불만이다." },
        },
        area: {
          type: "choice",
          instructions: "리뷰가 가리키는 앱 영역은?",
          criteria: { login: "로그인·계정", payment: "결제·구독", performance: "속도·배터리·발열", ui: "화면·사용성", content: "콘텐츠·기능 부족", other: "기타" },
        },
        severity: {
          type: "score",
          instructions: "사용자가 겪는 문제가 얼마나 심각한가?",
          criteria: ["0: 문제 없음 또는 취향", "1: 불편하지만 쓸 수 있음", "2: 주요 기능을 못 씀", "3: 돈·데이터 손실 또는 앱 자체를 못 씀"],
        },
      },
      decide: (a) => {
        const bug = a.is_bug.noul >= 0.5;
        if (bug && a.severity.score >= 1.5) return act(`온콜 (${a.area.choice})`, "crit");
        if (bug) return act(`백로그 (${a.area.choice})`, "warn");
        return act("CS 답변", "ok");
      },
      samples: [
        { label: "결제 후 구독 미적용", expect: "온콜 (payment)", state: { stars: 1, review: "연간 구독 결제했는데 계속 무료 버전으로 나와요. 돈만 빠져나갔습니다. 앱 지웠다 깔아도 똑같아요." } },
        { label: "다크모드 요청", expect: "CS 답변", state: { stars: 4, review: "잘 쓰고 있어요. 다크모드만 생기면 별 다섯 개 드릴게요!" } },
        { label: "스크롤 버벅임", expect: "백로그 (performance)", state: { stars: 3, review: "업데이트 후에 피드 스크롤할 때 좀 버벅여요. 쓸 수는 있는데 거슬리네요." } },
      ],
    },
    {
      id: "listing-check",
      cat: "신뢰·안전",
      title: "중고거래 게시글 검수",
      blurb: "중고거래 글 하나에 금지 품목 여부(noul)·사기 수법(choice)·위험도(score)를 함께 묻는다.",
      rule: "금지 품목 확률 50% 이상 삭제 · 위험도 1.5 이상 거래 전 경고 · 그 밖은 게시",
      gauge: { q: "risk", thresholds: [1.5], range: [0, 3] },
      questions: {
        prohibited: {
          type: "noul",
          instructions: "이 게시글이 거래 금지 품목(의약품, 담배·주류, 무기, 개인정보·계정, 위조품)을 파는가?",
          criteria: { true: "금지 품목을 판매한다.", false: "일반 중고 물품이다." },
        },
        scam_pattern: {
          type: "choice",
          instructions: "게시글에 보이는 사기 수법은?",
          criteria: { none: "없음", off_platform: "외부 메신저로 유도", prepay: "선입금·계좌이체만 요구", too_cheap: "시세보다 비정상적으로 쌈", fake_escrow: "가짜 안전결제 링크" },
        },
        risk: {
          type: "score",
          instructions: "구매자가 이 거래에서 피해를 볼 위험은?",
          criteria: ["0: 일반 거래", "1: 주의 필요", "2: 사기 신호가 뚜렷함", "3: 거의 확실한 사기"],
        },
      },
      decide: (a) => {
        if (a.prohibited.noul >= 0.5) return act("삭제", "crit");
        if (a.risk.score >= 1.5) return act("거래 전 경고", "warn");
        return act("게시", "ok");
      },
      samples: [
        { label: "평범한 자전거", expect: "게시", state: { title: "로드자전거 팝니다 (2년 사용)", body: "출퇴근용으로 탔고 체인 교체했습니다. 직거래 강남역, 45만 원." } },
        { label: "반값 아이폰 + 카톡 유도", expect: "거래 전 경고", state: { title: "아이폰 16 프로 미개봉 60만원", body: "급처합니다. 여기선 답장 늦으니 카톡 iphone_deal 로 연락 주세요. 선입금 시 택배 발송." } },
        { label: "처방약 판매", expect: "삭제", state: { title: "다이어트약 남은 거 팔아요", body: "병원에서 처방받은 식욕억제제 20정 남았어요. 반값에 드립니다." } },
      ],
    },
  );
})();
