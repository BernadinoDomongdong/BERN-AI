/**
 * i18n.js — UI translation engine.
 *
 * Design rule: the interface language always mirrors the answer language.
 * English is the default and canonical fallback. When a string is missing
 * for the selected locale, we fall back to English rather than showing a
 * blank or a key name.
 *
 * Usage:
 *   import { i18n } from './i18n.js';
 *   i18n.setLocale('ceb');
 *   i18n.applyToDocument();   // walks [data-i18n] elements and fills them in
 *   i18n.t('composer.placeholder');
 */

const STORAGE_KEY = 'bernai-language';
const DEFAULT_LOCALE = 'en';

/**
 * Each locale entry has:
 *  - label:       shown inside the language <select>
 *  - promptName:  human-readable name sent to the API so the model
 *                 replies in this language (null = user supplies free text)
 *  - strings:     UI copy, keyed by dot-path
 */
const LOCALES = {
    en: {
        label: 'English (Default)',
        promptName: 'English',
        strings: {
            'signboard.dest': 'Ask anything. Answers arrive in the language you choose below.',
            'field.model.label': 'Choose a model',
            'field.model.hint': 'all free — no cost',
            'field.model.loading': 'Loading free models…',
            'field.model.none': 'No free model available right now',
            'field.model.failed': 'Model list failed to load',
            'field.model.ready': (n) => `${n} free model${n === 1 ? '' : 's'} ready — pick one.`,
            'field.model.capacity': (n) => `Capacity: ~${n.toLocaleString('en-US')} tokens`,
            'field.language.label': 'Answer language',
            'field.language.hint': 'English is default',
            'field.language.customPlaceholder': 'Type a language (e.g. Hiligaynon, Italian)',
            'composer.placeholder': 'What do you want to ask?',
            'composer.ask': 'Ask',
            'composer.stop': 'Stop',
            'transit.label': 'Your answer is in transit…',
            'response.empty': 'No question yet. Go ahead, try one!',
            'response.cancelled': 'Question cancelled. Try again anytime.',
            'error.emptyMessage': 'Please type a question before pressing "Ask".',
            'error.noModel': 'No model selected yet — wait for the list to finish loading.',
            'error.modelsFailed': (msg) => `Couldn't load the free model list: ${msg}`,
            'error.requestFailed': (msg) => `Something went wrong: ${msg}`,
            'error.noReply': 'No reply received.',
            'error.timeout': 'Request timed out. Please try again.',
            'error.messageTooLong': 'Your question is too long — please shorten it.',
            'theme.toDay': 'Switch to day mode',
            'theme.toNight': 'Switch to night mode',
            'footer.tagline': 'made in Cebu 🇵🇭',
        },
    },
    ceb: {
        label: 'Binisaya / Cebuano',
        promptName: 'Binisaya (Cebuano)',
        strings: {
            'signboard.dest': 'Pangutana bisan unsa. Ang tubag moabot sa pinulongan nga imong gipili sa ubos.',
            'field.model.label': 'Pilia ang Modelo',
            'field.model.hint': 'libre tanan — walay bayad',
            'field.model.loading': 'Gina-andam ang lista sa mga libre nga modelo…',
            'field.model.none': 'Walay libre nga modelo karon',
            'field.model.failed': 'Wala nakarga ang listahan sa modelo',
            'field.model.ready': (n) => `${n} ka libre nga modelo ang andam — pilia lang.`,
            'field.model.capacity': (n) => `Kapasidad: ~${n.toLocaleString('en-US')} ka tokens`,
            'field.language.label': 'Pinulongan sa Tubag',
            'field.language.hint': 'English ang default',
            'field.language.customPlaceholder': 'Isulat ang pinulongan (e.g. Hiligaynon, Italiano)',
            'composer.placeholder': 'Unsa may imong pangutana?',
            'composer.ask': 'Tubaga',
            'composer.stop': 'Hunong',
            'transit.label': 'Nagbiyahe pa ang tubag…',
            'response.empty': 'Wala pay pangutana. Sige, sulayi!',
            'response.cancelled': 'Gikansela ang pangutana. Sulayi og usab kung gusto.',
            'error.emptyMessage': 'Palihug pagsulat og pangutana una mag-click sa "Tubaga".',
            'error.noModel': 'Wala pay napiling modelo — hulata una nga makumpleto ang pag-load sa listahan.',
            'error.modelsFailed': (msg) => `Wala nakarga ang listahan sa libre nga mga modelo: ${msg}`,
            'error.requestFailed': (msg) => `Sayop: ${msg}`,
            'error.noReply': 'Walay tubag nga nadawat.',
            'error.timeout': 'Naabtan ang panahon sa pangutana. Sulayi og usab.',
            'error.messageTooLong': 'Taas kaayo ang imong pangutana — puliha og mubo.',
            'theme.toDay': 'Ilisi sa day mode',
            'theme.toNight': 'Ilisi sa night mode',
            'footer.tagline': 'gibuhat sa Cebu 🇵🇭',
        },
    },
    fil: {
        label: 'Filipino / Tagalog',
        promptName: 'Filipino (Tagalog)',
        strings: {
            'signboard.dest': 'Magtanong ng kahit ano. Dumarating ang sagot sa wikang pinili mo sa ibaba.',
            'field.model.label': 'Pumili ng Modelo',
            'field.model.hint': 'lahat libre — walang bayad',
            'field.model.loading': 'Inihahanda ang listahan ng libreng modelo…',
            'field.model.none': 'Walang libreng modelo sa ngayon',
            'field.model.failed': 'Hindi na-load ang listahan ng modelo',
            'field.model.ready': (n) => `${n} libreng modelo ang handa — pumili ka lang.`,
            'field.model.capacity': (n) => `Kapasidad: ~${n.toLocaleString('en-US')} tokens`,
            'field.language.label': 'Wika ng Sagot',
            'field.language.hint': 'English ang default',
            'field.language.customPlaceholder': 'I-type ang wika (hal. Hiligaynon, Italyano)',
            'composer.placeholder': 'Ano ang gusto mong itanong?',
            'composer.ask': 'Magtanong',
            'composer.stop': 'Ihinto',
            'transit.label': 'Papunta na ang sagot…',
            'response.empty': 'Wala pang tanong. Sige, subukan mo!',
            'response.cancelled': 'Nakansela ang tanong. Subukan ulit anumang oras.',
            'error.emptyMessage': 'Mag-type muna ng tanong bago pindutin ang "Magtanong".',
            'error.noModel': 'Wala pang napiling modelo — hintayin munang matapos mag-load ang listahan.',
            'error.modelsFailed': (msg) => `Hindi na-load ang listahan ng libreng modelo: ${msg}`,
            'error.requestFailed': (msg) => `May error: ${msg}`,
            'error.noReply': 'Walang natanggap na sagot.',
            'error.timeout': 'Nag-timeout ang kahilingan. Subukan ulit.',
            'error.messageTooLong': 'Masyadong mahaba ang tanong mo — paikliin.',
            'theme.toDay': 'Lumipat sa day mode',
            'theme.toNight': 'Lumipat sa night mode',
            'footer.tagline': 'gawa sa Cebu 🇵🇭',
        },
    },
    es: {
        label: 'Español',
        promptName: 'Spanish',
        strings: {
            'signboard.dest': 'Pregunta lo que quieras. Las respuestas llegan en el idioma que elijas abajo.',
            'field.model.label': 'Elige un modelo',
            'field.model.hint': 'todos gratis — sin costo',
            'field.model.loading': 'Cargando modelos gratuitos…',
            'field.model.none': 'No hay modelos gratuitos disponibles',
            'field.model.failed': 'No se pudo cargar la lista de modelos',
            'field.model.ready': (n) => `${n} modelo${n === 1 ? '' : 's'} gratuito${n === 1 ? '' : 's'} listo${n === 1 ? '' : 's'} — elige uno.`,
            'field.model.capacity': (n) => `Capacidad: ~${n.toLocaleString('en-US')} tokens`,
            'field.language.label': 'Idioma de respuesta',
            'field.language.hint': 'inglés por defecto',
            'field.language.customPlaceholder': 'Escribe un idioma (p. ej. italiano)',
            'composer.placeholder': '¿Qué quieres preguntar?',
            'composer.ask': 'Preguntar',
            'composer.stop': 'Detener',
            'transit.label': 'Tu respuesta va en camino…',
            'response.empty': 'Aún no hay preguntas. ¡Adelante, prueba una!',
            'response.cancelled': 'Pregunta cancelada. Intenta de nuevo cuando quieras.',
            'error.emptyMessage': 'Escribe una pregunta antes de pulsar "Preguntar".',
            'error.noModel': 'Aún no hay modelo seleccionado — espera a que termine de cargar la lista.',
            'error.modelsFailed': (msg) => `No se pudo cargar la lista de modelos gratuitos: ${msg}`,
            'error.requestFailed': (msg) => `Ocurrió un error: ${msg}`,
            'error.noReply': 'No se recibió respuesta.',
            'error.timeout': 'Se agotó el tiempo de espera. Inténtalo de nuevo.',
            'error.messageTooLong': 'Tu pregunta es demasiado larga — acórtala.',
            'theme.toDay': 'Cambiar a modo día',
            'theme.toNight': 'Cambiar a modo noche',
            'footer.tagline': 'hecho en Cebú 🇵🇭',
        },
    },
    ja: {
        label: '日本語',
        promptName: 'Japanese',
        strings: {
            'signboard.dest': '何でも聞いてください。回答は下で選んだ言語で届きます。',
            'field.model.label': 'モデルを選択',
            'field.model.hint': 'すべて無料',
            'field.model.loading': '無料モデルを読み込み中…',
            'field.model.none': '現在利用できる無料モデルはありません',
            'field.model.failed': 'モデル一覧の読み込みに失敗しました',
            'field.model.ready': (n) => `${n} 個の無料モデルが利用可能です。`,
            'field.model.capacity': (n) => `容量: 約 ${n.toLocaleString('en-US')} トークン`,
            'field.language.label': '回答言語',
            'field.language.hint': '既定は英語',
            'field.language.customPlaceholder': '言語を入力（例: イタリア語）',
            'composer.placeholder': '何を質問しますか？',
            'composer.ask': '質問する',
            'composer.stop': '停止',
            'transit.label': '回答を送信中…',
            'response.empty': 'まだ質問がありません。試してみましょう！',
            'response.cancelled': '質問をキャンセルしました。いつでも再試行できます。',
            'error.emptyMessage': '「質問する」を押す前に質問を入力してください。',
            'error.noModel': 'モデルが選択されていません。一覧の読み込み完了をお待ちください。',
            'error.modelsFailed': (msg) => `無料モデル一覧を読み込めませんでした: ${msg}`,
            'error.requestFailed': (msg) => `エラーが発生しました: ${msg}`,
            'error.noReply': '返信がありませんでした。',
            'error.timeout': 'リクエストがタイムアウトしました。もう一度お試しください。',
            'error.messageTooLong': '質問が長すぎます。短くしてください。',
            'theme.toDay': 'デイモードに切り替え',
            'theme.toNight': 'ナイトモードに切り替え',
            'footer.tagline': 'セブ制作 🇵🇭',
        },
    },
    ko: {
        label: '한국어',
        promptName: 'Korean',
        strings: {
            'signboard.dest': '무엇이든 물어보세요. 아래에서 선택한 언어로 답변이 도착합니다.',
            'field.model.label': '모델 선택',
            'field.model.hint': '모두 무료',
            'field.model.loading': '무료 모델 목록을 불러오는 중…',
            'field.model.none': '현재 이용 가능한 무료 모델이 없습니다',
            'field.model.failed': '모델 목록을 불러오지 못했습니다',
            'field.model.ready': (n) => `무료 모델 ${n}개가 준비되었습니다 — 선택하세요.`,
            'field.model.capacity': (n) => `용량: 약 ${n.toLocaleString('en-US')} 토큰`,
            'field.language.label': '답변 언어',
            'field.language.hint': '기본값은 영어',
            'field.language.customPlaceholder': '언어 입력 (예: 이탈리아어)',
            'composer.placeholder': '무엇을 물어보시겠어요?',
            'composer.ask': '질문하기',
            'composer.stop': '중지',
            'transit.label': '답변이 이동 중입니다…',
            'response.empty': '아직 질문이 없습니다. 한번 해보세요!',
            'response.cancelled': '질문이 취소되었습니다. 언제든 다시 시도하세요.',
            'error.emptyMessage': '"질문하기"를 누르기 전에 질문을 입력하세요.',
            'error.noModel': '아직 모델이 선택되지 않았습니다 — 목록 로딩이 끝날 때까지 기다려 주세요.',
            'error.modelsFailed': (msg) => `무료 모델 목록을 불러오지 못했습니다: ${msg}`,
            'error.requestFailed': (msg) => `오류가 발생했습니다: ${msg}`,
            'error.noReply': '응답을 받지 못했습니다.',
            'error.timeout': '요청 시간이 초과되었습니다. 다시 시도해 주세요.',
            'error.messageTooLong': '질문이 너무 깁니다. 줄여 주세요.',
            'theme.toDay': '주간 모드로 전환',
            'theme.toNight': '야간 모드로 전환',
            'footer.tagline': '세부에서 제작 🇵🇭',
        },
    },
    zh: {
        label: '中文',
        promptName: 'Chinese (Simplified)',
        strings: {
            'signboard.dest': '尽管提问。答案将以你在下方选择的语言呈现。',
            'field.model.label': '选择模型',
            'field.model.hint': '全部免费',
            'field.model.loading': '正在加载免费模型…',
            'field.model.none': '当前没有可用的免费模型',
            'field.model.failed': '模型列表加载失败',
            'field.model.ready': (n) => `已就绪 ${n} 个免费模型 — 请选择一个。`,
            'field.model.capacity': (n) => `容量：约 ${n.toLocaleString('en-US')} 个 token`,
            'field.language.label': '回答语言',
            'field.language.hint': '默认英语',
            'field.language.customPlaceholder': '输入语言（例如意大利语）',
            'composer.placeholder': '你想问什么？',
            'composer.ask': '提问',
            'composer.stop': '停止',
            'transit.label': '答案传送中…',
            'response.empty': '还没有问题，试试看吧！',
            'response.cancelled': '问题已取消，随时可以重试。',
            'error.emptyMessage': '请先输入问题，再点击"提问"。',
            'error.noModel': '尚未选择模型 — 请等待列表加载完成。',
            'error.modelsFailed': (msg) => `无法加载免费模型列表：${msg}`,
            'error.requestFailed': (msg) => `出错了：${msg}`,
            'error.noReply': '未收到回复。',
            'error.timeout': '请求超时，请重试。',
            'error.messageTooLong': '问题太长了，请缩短。',
            'theme.toDay': '切换到日间模式',
            'theme.toNight': '切换到夜间模式',
            'footer.tagline': '制作于宿务 🇵🇭',
        },
    },
    fr: {
        label: 'Français',
        promptName: 'French',
        strings: {
            'signboard.dest': 'Posez n\u2019importe quelle question. Les réponses arrivent dans la langue choisie ci-dessous.',
            'field.model.label': 'Choisir un modèle',
            'field.model.hint': 'tous gratuits',
            'field.model.loading': 'Chargement des modèles gratuits…',
            'field.model.none': 'Aucun modèle gratuit disponible',
            'field.model.failed': 'Échec du chargement de la liste des modèles',
            'field.model.ready': (n) => `${n} modèle${n === 1 ? '' : 's'} gratuit${n === 1 ? '' : 's'} prêt${n === 1 ? '' : 's'} — choisissez-en un.`,
            'field.model.capacity': (n) => `Capacité : ~${n.toLocaleString('en-US')} tokens`,
            'field.language.label': 'Langue de réponse',
            'field.language.hint': 'anglais par défaut',
            'field.language.customPlaceholder': 'Saisissez une langue (ex. italien)',
            'composer.placeholder': 'Que voulez-vous demander ?',
            'composer.ask': 'Demander',
            'composer.stop': 'Arrêter',
            'transit.label': 'Votre réponse est en route…',
            'response.empty': 'Pas encore de question. Essayez-en une !',
            'response.cancelled': 'Question annulée. Réessayez quand vous voulez.',
            'error.emptyMessage': 'Écrivez une question avant de cliquer sur "Demander".',
            'error.noModel': 'Aucun modèle sélectionné — attendez la fin du chargement de la liste.',
            'error.modelsFailed': (msg) => `Impossible de charger la liste des modèles gratuits : ${msg}`,
            'error.requestFailed': (msg) => `Une erreur est survenue : ${msg}`,
            'error.noReply': 'Aucune réponse reçue.',
            'error.timeout': 'La requête a expiré. Veuillez réessayer.',
            'error.messageTooLong': 'Votre question est trop longue — veuillez la raccourcir.',
            'theme.toDay': 'Passer en mode jour',
            'theme.toNight': 'Passer en mode nuit',
            'footer.tagline': 'fabriqué à Cebu 🇵🇭',
        },
    },
    de: {
        label: 'Deutsch',
        promptName: 'German',
        strings: {
            'signboard.dest': 'Frag einfach drauflos. Antworten kommen in der unten gewählten Sprache.',
            'field.model.label': 'Modell wählen',
            'field.model.hint': 'alles kostenlos',
            'field.model.loading': 'Kostenlose Modelle werden geladen…',
            'field.model.none': 'Derzeit kein kostenloses Modell verfügbar',
            'field.model.failed': 'Modellliste konnte nicht geladen werden',
            'field.model.ready': (n) => `${n} kostenlose${n === 1 ? 's' : ''} Modell${n === 1 ? '' : 'e'} bereit — wähle eins.`,
            'field.model.capacity': (n) => `Kapazität: ~${n.toLocaleString('en-US')} Tokens`,
            'field.language.label': 'Antwortsprache',
            'field.language.hint': 'Standard: Englisch',
            'field.language.customPlaceholder': 'Sprache eingeben (z. B. Italienisch)',
            'composer.placeholder': 'Was möchtest du fragen?',
            'composer.ask': 'Fragen',
            'composer.stop': 'Stopp',
            'transit.label': 'Deine Antwort ist unterwegs…',
            'response.empty': 'Noch keine Frage. Leg los!',
            'response.cancelled': 'Frage abgebrochen. Versuch es jederzeit erneut.',
            'error.emptyMessage': 'Bitte gib eine Frage ein, bevor du auf "Fragen" klickst.',
            'error.noModel': 'Noch kein Modell ausgewählt — warte, bis die Liste geladen ist.',
            'error.modelsFailed': (msg) => `Liste der kostenlosen Modelle konnte nicht geladen werden: ${msg}`,
            'error.requestFailed': (msg) => `Es ist ein Fehler aufgetreten: ${msg}`,
            'error.noReply': 'Keine Antwort erhalten.',
            'error.timeout': 'Zeitüberschreitung bei der Anfrage. Bitte erneut versuchen.',
            'error.messageTooLong': 'Deine Frage ist zu lang — bitte kürzen.',
            'theme.toDay': 'Zum Tagmodus wechseln',
            'theme.toNight': 'Zum Nachtmodus wechseln',
            'footer.tagline': 'gemacht in Cebu 🇵🇭',
        },
    },
    ar: {
        label: 'العربية',
        promptName: 'Arabic',
        strings: {
            'signboard.dest': 'اسأل أي شيء. تصلك الإجابات باللغة التي تختارها أدناه.',
            'field.model.label': 'اختر نموذجًا',
            'field.model.hint': 'الكل مجاني',
            'field.model.loading': 'جارٍ تحميل النماذج المجانية…',
            'field.model.none': 'لا يوجد نموذج مجاني متاح الآن',
            'field.model.failed': 'تعذّر تحميل قائمة النماذج',
            'field.model.ready': (n) => `${n} نموذج مجاني جاهز — اختر واحدًا.`,
            'field.model.capacity': (n) => `السعة: ~${n.toLocaleString('en-US')} رمز`,
            'field.language.label': 'لغة الإجابة',
            'field.language.hint': 'الإنجليزية افتراضيًا',
            'field.language.customPlaceholder': 'اكتب لغة (مثال: الإيطالية)',
            'composer.placeholder': 'ما الذي تريد سؤاله؟',
            'composer.ask': 'اسأل',
            'composer.stop': 'إيقاف',
            'transit.label': 'إجابتك في الطريق…',
            'response.empty': 'لا يوجد سؤال بعد. جرّب الآن!',
            'response.cancelled': 'تم إلغاء السؤال. أعد المحاولة في أي وقت.',
            'error.emptyMessage': 'يرجى كتابة سؤال قبل الضغط على "اسأل".',
            'error.noModel': 'لم يتم اختيار نموذج بعد — انتظر اكتمال تحميل القائمة.',
            'error.modelsFailed': (msg) => `تعذّر تحميل قائمة النماذج المجانية: ${msg}`,
            'error.requestFailed': (msg) => `حدث خطأ: ${msg}`,
            'error.noReply': 'لم يتم استلام أي رد.',
            'error.timeout': 'انتهت مهلة الطلب. يرجى المحاولة مرة أخرى.',
            'error.messageTooLong': 'سؤالك طويل جدًا — يرجى اختصاره.',
            'theme.toDay': 'التبديل إلى وضع النهار',
            'theme.toNight': 'التبديل إلى وضع الليل',
            'footer.tagline': 'صُنع في سيبو 🇵🇭',
        },
    },
};

/** Locales whose UI reads right-to-left. */
const RTL_LOCALES = new Set(['ar']);

class I18n {
    constructor() {
        this._locale = DEFAULT_LOCALE;
        this._listeners = new Set();
    }

    /** All selectable locales, in the order they should appear in the <select>. */
    get options() {
        return Object.keys(LOCALES).map((code) => ({ code, label: LOCALES[code].label }));
    }

    get locale() {
        return this._locale;
    }

    /** Returns whether a given locale code is one we actually ship strings for. */
    isKnown(code) {
        return Object.prototype.hasOwnProperty.call(LOCALES, code);
    }

    setLocale(code) {
        this._locale = this.isKnown(code) ? code : DEFAULT_LOCALE;
        this._listeners.forEach((fn) => fn(this._locale));
        return this._locale;
    }

    /** Subscribe to locale changes. Returns an unsubscribe function. */
    onChange(fn) {
        this._listeners.add(fn);
        return () => this._listeners.delete(fn);
    }

    /**
     * Translate a key for the current locale. `args` are passed through to
     * function-valued strings (used for pluralization / interpolation).
     */
    t(key, ...args) {
        const entry = LOCALES[this._locale]?.strings[key] ?? LOCALES[DEFAULT_LOCALE].strings[key];
        if (entry === undefined) return key;
        return typeof entry === 'function' ? entry(...args) : entry;
    }

    /** Human-readable language name to send to the backend for a given locale. */
    promptNameFor(code) {
        return LOCALES[code]?.promptName ?? LOCALES[DEFAULT_LOCALE].promptName;
    }

    isRtl(code = this._locale) {
        return RTL_LOCALES.has(code);
    }

    /**
     * Walks the DOM for [data-i18n] / [data-i18n-placeholder] / [data-i18n-aria-label]
     * and fills in the current locale's strings. Static text only — this
     * never touches dynamic content like the AI's answer, which keeps its
     * own language independently.
     */
    applyToDocument(root = document) {
        root.querySelectorAll('[data-i18n]').forEach((el) => {
            el.textContent = this.t(el.getAttribute('data-i18n'));
        });
        root.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
            el.placeholder = this.t(el.getAttribute('data-i18n-placeholder'));
        });
        root.querySelectorAll('[data-i18n-aria-label]').forEach((el) => {
            el.setAttribute('aria-label', this.t(el.getAttribute('data-i18n-aria-label')));
        });

        document.documentElement.lang = this._locale;
        document.documentElement.dir = this.isRtl() ? 'rtl' : 'ltr';
    }

    /** Persist + restore the chosen UI/answer locale across visits. */
    loadStoredLocale() {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            return this.isKnown(stored) ? stored : DEFAULT_LOCALE;
        } catch {
            return DEFAULT_LOCALE;
        }
    }

    persistLocale(code) {
        try {
            localStorage.setItem(STORAGE_KEY, code);
        } catch {
            /* storage unavailable — non-fatal, preference just won't persist */
        }
    }
}

export const i18n = new I18n();
export { DEFAULT_LOCALE };
