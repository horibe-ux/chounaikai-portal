import { useEffect, useState } from "react";

type Member = {
  id: string;
  name: string;
  neighborhood_association: string;
  school_district: string;
  payment_status: "未納" | "済";
};

type LoginResponse =
  | { success: true; member: Member; sessionToken: string }
  | { success: false; message: string };

type MeResponse =
  | { success: true; member: Member }
  | { success: false; message: string };

type Circular = {
  id: string;
  neighborhood_association: string;
  title: string;
  content: string;
  summary: string[];
};

type CircularsResponse =
  | { success: true; circulars: Circular[] }
  | { success: false; message: string };

type AskAiResponse =
  | { success: true; answer: string }
  | { success: false; message: string };

type LoginState =
  | { status: "waiting" } // QRコード待ち
  | { status: "loading" } // API問い合わせ中
  | { status: "success"; member: Member }
  | { status: "error"; message: string };

type CircularsState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; circulars: Circular[] }
  | { status: "error"; message: string };

type VoiceState = "idle" | "listening" | "processing" | "error";

type BrowserSpeechRecognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onresult: ((event: any) => void) | null;
  onerror: ((event: any) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type BrowserSpeechRecognitionConstructor = new () => BrowserSpeechRecognition;

type SpeechWindow = Window & {
  SpeechRecognition?: BrowserSpeechRecognitionConstructor;
  webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor;
};

const API_BASE_URL = import.meta.env.DEV
  ? ((import.meta.env.VITE_DEV_API_BASE_URL as string | undefined) ?? "")
  : ((import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:4001");

const SESSION_STORAGE_KEY = "chounaikai_session_token";

function App() {
  const [loginState, setLoginState] = useState<LoginState>({
    status: "waiting",
  });
  const [circularsState, setCircularsState] = useState<CircularsState>({
    status: "idle",
  });
  const [openCircularId, setOpenCircularId] = useState<string | null>(null);
  const [voiceModalOpen, setVoiceModalOpen] = useState(false);
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [voiceErrorMessage, setVoiceErrorMessage] = useState<string | null>(null);
  const [recognizedQuestion, setRecognizedQuestion] = useState("");
  const [aiAnswer, setAiAnswer] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const qrToken = params.get("token");
    const controller = new AbortController();

    async function loginWithQrToken(qrToken: string) {
      setLoginState({ status: "loading" });
      try {
        const res = await fetch(
          `${API_BASE_URL}/api/login?token=${encodeURIComponent(qrToken)}`,
          { signal: controller.signal }
        );
        const data: LoginResponse = await res.json();

        if (data.success) {
          localStorage.setItem(SESSION_STORAGE_KEY, data.sessionToken);
          // token付きURLを綺麗にする（再読み込みしてもQRを読み直させないため）
          window.history.replaceState({}, "", window.location.pathname);
          setLoginState({ status: "success", member: data.member });
        } else {
          setLoginState({ status: "error", message: data.message });
        }
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setLoginState({
          status: "error",
          message:
            "サーバーに接続できませんでした。しばらくしてから再度お試しください。",
        });
      }
    }

    async function restoreSession(sessionToken: string) {
      setLoginState({ status: "loading" });
      try {
        const res = await fetch(`${API_BASE_URL}/api/me`, {
          headers: { Authorization: `Bearer ${sessionToken}` },
          signal: controller.signal,
        });
        const data: MeResponse = await res.json();

        if (data.success) {
          setLoginState({ status: "success", member: data.member });
        } else {
          localStorage.removeItem(SESSION_STORAGE_KEY);
          setLoginState({ status: "waiting" });
        }
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setLoginState({
          status: "error",
          message:
            "サーバーに接続できませんでした。しばらくしてから再度お試しください。",
        });
      }
    }

    if (qrToken) {
      loginWithQrToken(qrToken);
    } else {
      const savedSessionToken = localStorage.getItem(SESSION_STORAGE_KEY);
      if (savedSessionToken) {
        restoreSession(savedSessionToken);
      } else {
        setLoginState({ status: "waiting" });
      }
    }

    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (loginState.status !== "success") {
      return;
    }

    const controller = new AbortController();

    async function loadCirculars(association: string) {
      setCircularsState({ status: "loading" });

      try {
        const res = await fetch(
          `${API_BASE_URL}/api/circulars?association=${encodeURIComponent(association)}`,
          { signal: controller.signal }
        );
        const data: CircularsResponse = await res.json();

        if (data.success) {
          setCircularsState({ status: "success", circulars: data.circulars });
        } else {
          setCircularsState({ status: "error", message: data.message });
        }
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setCircularsState({
          status: "error",
          message: "回覧板を取得できませんでした。しばらくしてから再度お試しください。",
        });
      }
    }

    loadCirculars(loginState.member.neighborhood_association);

    return () => controller.abort();
  }, [loginState]);

  function handleLogout() {
    localStorage.removeItem(SESSION_STORAGE_KEY);
    setLoginState({ status: "waiting" });
    setCircularsState({ status: "idle" });
    setOpenCircularId(null);
  }

  async function askAiViceChair(question: string) {
    setVoiceState("processing");
    setVoiceErrorMessage(null);

    try {
      const res = await fetch(`${API_BASE_URL}/api/ask-ai`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ question }),
      });

      const data: AskAiResponse = await res.json();
      if (data.success) {
        setAiAnswer(data.answer);
        setVoiceModalOpen(false);
        setVoiceState("idle");
        return;
      }

      setVoiceState("error");
      setVoiceErrorMessage(data.message);
    } catch {
      setVoiceState("error");
      setVoiceErrorMessage("AI副会長に接続できませんでした。もう一度お試しください。");
    }
  }

  function startVoiceRecognition() {
    setAiAnswer(null);
    setRecognizedQuestion("");
    setVoiceErrorMessage(null);
    setVoiceModalOpen(true);

    const speechWindow = window as SpeechWindow;
    const RecognitionClass =
      speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;

    if (!RecognitionClass) {
      setVoiceState("error");
      setVoiceErrorMessage(
        "このブラウザでは音声入力を利用できません。Chrome でお試しください。"
      );
      return;
    }

    const recognition = new RecognitionClass();
    let hasTranscript = false;
    recognition.lang = "ja-JP";
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.maxAlternatives = 1;

    setVoiceState("listening");

    recognition.onresult = (event: any) => {
      const transcript = event?.results?.[0]?.[0]?.transcript?.trim?.() ?? "";
      if (!transcript) {
        setVoiceState("error");
        setVoiceErrorMessage("うまく聞き取れませんでした。もう一度お話しください。");
        return;
      }

      hasTranscript = true;
      setRecognizedQuestion(transcript);
      askAiViceChair(transcript);
    };

    recognition.onerror = () => {
      setVoiceState("error");
      setVoiceErrorMessage("音声入力でエラーが発生しました。もう一度お試しください。");
    };

    recognition.onend = () => {
      setVoiceState((current) => {
        if (current === "listening" && !hasTranscript) {
          setVoiceErrorMessage("うまく聞き取れませんでした。もう一度お試しください。");
          return "error";
        }
        return current;
      });
    };

    recognition.start();
  }

  return (
    <>
      <div className="min-h-screen bg-slate-50 text-slate-900">
        {loginState.status === "success" ? (
          <DashboardView
            member={loginState.member}
            circularsState={circularsState}
            openCircularId={openCircularId}
            onToggleCircular={(id) =>
              setOpenCircularId((current) => (current === id ? null : id))
            }
            onLogout={handleLogout}
          />
        ) : (
          <div className="flex min-h-screen items-center justify-center px-4 py-8 sm:px-6 lg:px-8">
            <div className="w-full max-w-xl rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm sm:p-10">
              {loginState.status === "waiting" && <WaitingView />}
              {loginState.status === "loading" && <LoadingView />}
              {loginState.status === "error" && (
                <ErrorView message={loginState.message} />
              )}
            </div>
          </div>
        )}
      </div>

      <VoiceAssistantButton onClick={startVoiceRecognition} />

      {voiceModalOpen && (
        <VoiceModal
          state={voiceState}
          recognizedQuestion={recognizedQuestion}
          errorMessage={voiceErrorMessage}
          onClose={() => {
            setVoiceModalOpen(false);
            setVoiceState("idle");
            setVoiceErrorMessage(null);
            setRecognizedQuestion("");
          }}
        />
      )}

      {aiAnswer && (
        <AiAnswerPanel
          answer={aiAnswer}
          onClose={() => setAiAnswer(null)}
        />
      )}
    </>
  );
}

function WaitingView() {
  return (
    <div>
      <div className="mb-6 text-7xl" aria-hidden="true">
        📷
      </div>
      <h1 className="mb-4 text-3xl font-bold leading-relaxed text-slate-800">
        QRコードを
        <br />
        読み取ってください
      </h1>
      <p className="text-lg leading-relaxed text-slate-600">
        お手元の「回覧板」または「町内会だより」に
        <br />
        記載されているQRコードを
        <br />
        カメラで読み取ってください。
      </p>
    </div>
  );
}

function LoadingView() {
  return (
    <div>
      <div
        className="mx-auto mb-6 h-16 w-16 animate-spin rounded-full border-8 border-slate-200 border-t-[#1E3A5F]"
        role="status"
        aria-label="読み込み中"
      />
      <h1 className="text-2xl font-bold text-slate-800">確認しています…</h1>
    </div>
  );
}

function DashboardView({
  member,
  circularsState,
  openCircularId,
  onToggleCircular,
  onLogout,
}: {
  member: Member;
  circularsState: CircularsState;
  openCircularId: string | null;
  onToggleCircular: (id: string) => void;
  onLogout: () => void;
}) {
  const [showPaypayInfoModal, setShowPaypayInfoModal] = useState(false);
  const circularCount =
    circularsState.status === "success" ? circularsState.circulars.length : 0;

  return (
    <div className="mx-auto flex min-h-screen max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <header className="rounded-3xl border border-[#17304D] bg-[#1E3A5F] px-6 py-6 text-white shadow-sm sm:px-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-sm font-semibold tracking-[0.08em] text-amber-200">
              デジタル自治会ポータル
            </p>
            <h1 className="mt-3 text-3xl font-bold leading-tight sm:text-4xl">
              こんにちは、{member.name}さん
            </h1>
            <p className="mt-3 text-lg leading-relaxed text-slate-100">
              所属自治会: {member.neighborhood_association} / 学校区: {member.school_district}
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 lg:w-[24rem] lg:grid-cols-1">
            <InfoChip label="世帯ID" value={member.id} />
            <InfoChip label="会費納入状況" value={member.payment_status} />
            <InfoChip label="回覧板件数" value={`${circularCount}件`} />
          </div>
        </div>
      </header>

      <section
        className={`rounded-3xl border-2 px-6 py-6 shadow-sm sm:px-8 ${
          member.payment_status === "済"
            ? "border-emerald-300 bg-emerald-50"
            : "border-amber-300 bg-amber-50"
        }`}
      >
        <p className="text-base font-bold tracking-[0.08em] text-slate-600">
          自治会費の納入状況
        </p>
        <p
          className={`mt-2 text-4xl font-extrabold leading-tight sm:text-5xl ${
            member.payment_status === "済" ? "text-emerald-700" : "text-amber-700"
          }`}
        >
          {member.payment_status === "済" ? "納入済" : "未納"}
        </p>

        {member.payment_status === "未納" && (
          <button
            type="button"
            onClick={() => setShowPaypayInfoModal(true)}
            className="mt-5 inline-flex min-h-[56px] items-center justify-center rounded-xl bg-[#D97706] px-6 text-xl font-bold text-white shadow-sm transition hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-300"
          >
            PayPayで支払う（ダミーボタン）
          </button>
        )}
      </section>

      {showPaypayInfoModal && (
        <PaypayInfoModal onClose={() => setShowPaypayInfoModal(false)} />
      )}

      <main className="grid gap-6 lg:grid-cols-[1.1fr_1.9fr]">
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#1E3A5F]/10 text-3xl" aria-hidden="true">
              ✅
            </div>
            <div>
              <h2 className="text-2xl font-bold leading-tight text-slate-900">
                ログイン完了
              </h2>
              <p className="text-base leading-relaxed text-slate-600">
                重要なお知らせを順番にご確認ください。
              </p>
            </div>
          </div>

          <dl className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-5 text-base leading-relaxed">
            <InfoRow label="世帯ID" value={member.id} />
            <InfoRow label="学校区" value={member.school_district} />
            <InfoRow label="会費納入状況" value={member.payment_status} />
          </dl>

          <button
            type="button"
            onClick={onLogout}
            className="mt-6 inline-flex min-h-[52px] w-full items-center justify-center rounded-xl border border-[#1E3A5F] bg-white px-6 text-lg font-bold text-[#1E3A5F] shadow-sm transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/40"
          >
            ログアウトする
          </button>
        </section>

        <section className="space-y-4 rounded-3xl border border-slate-200 bg-slate-50 p-4 sm:p-6">
          <div className="rounded-2xl border-2 border-[#D97706] bg-amber-50 px-5 py-4 shadow-sm">
            <p className="text-sm font-bold tracking-[0.08em] text-[#D97706]">
              🤖 AI副会長の3行要約
            </p>
            <p className="mt-2 text-lg font-bold leading-relaxed text-slate-900">
              まずは回覧板の要点を一目で確認できます。
            </p>
          </div>

          {circularsState.status === "loading" && <CircularsLoading />}

          {circularsState.status === "error" && (
            <div className="rounded-2xl border border-amber-200 bg-white p-5 text-base leading-relaxed text-slate-700 shadow-sm">
              {circularsState.message}
            </div>
          )}

          {circularsState.status === "success" && circularsState.circulars.length > 0 ? (
            <div className="space-y-4">
              {circularsState.circulars.map((circular) => {
                const isOpen = openCircularId === circular.id;

                return (
                  <article
                    key={circular.id}
                    className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"
                  >
                    <div className="flex flex-col gap-4">
                      <div className="flex flex-col gap-3">
                        <div className="flex flex-wrap items-center gap-2 text-sm font-semibold tracking-[0.08em] text-slate-500">
                          <span className="rounded-full bg-[#1E3A5F]/10 px-3 py-1 text-[#1E3A5F]">
                            回覧板
                          </span>
                          <span>{circular.neighborhood_association}</span>
                        </div>
                        <h3 className="text-2xl font-bold leading-tight text-slate-900">
                          {circular.title}
                        </h3>
                      </div>

                      <div className="rounded-2xl border-2 border-[#D97706] bg-amber-50 p-5">
                        <p className="text-sm font-bold tracking-[0.08em] text-[#D97706]">
                          🤖 AI副会長の3行要約
                        </p>
                        <ul className="mt-3 space-y-2 text-base font-bold leading-8 text-slate-900">
                          {circular.summary.map((line) => (
                            <li key={line} className="flex gap-2">
                              <span className="text-[#D97706]">・</span>
                              <span>{line}</span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      <button
                        type="button"
                        onClick={() => onToggleCircular(circular.id)}
                        className="inline-flex min-h-[52px] w-full items-center justify-center rounded-xl bg-[#1E3A5F] px-6 text-lg font-bold text-white shadow-sm transition hover:bg-[#17304D] focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/40"
                      >
                        {isOpen ? "詳細を閉じる" : "詳細を開く"}
                      </button>

                      {isOpen && (
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 text-base leading-8 text-slate-700">
                          {circular.content}
                        </div>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          ) : circularsState.status === "success" ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-5 text-base leading-relaxed text-slate-700 shadow-sm">
              この自治会に配信された回覧板はまだありません。
            </div>
          ) : null}
        </section>
      </main>
    </div>
  );
}

function PaypayInfoModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4">
      <div className="w-full max-w-3xl rounded-3xl bg-white p-8 shadow-2xl sm:p-10">
        <p className="text-[22px] font-extrabold leading-relaxed text-slate-900">
          キャッシュレス決済（PayPay）は、次回のシステムアップデートでご利用いただけるようになります。現在は準備中のため、お手数ですがお近くの班長さんへ直接お支払いください。
        </p>

        <button
          type="button"
          onClick={onClose}
          className="mt-8 inline-flex min-h-[54px] w-full items-center justify-center rounded-xl bg-[#1E3A5F] px-6 text-xl font-bold text-white shadow-sm transition hover:bg-[#17304D] focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/40"
        >
          閉じる
        </button>
      </div>
    </div>
  );
}

function InfoChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-left">
      <p className="text-sm font-semibold tracking-[0.06em] text-amber-200">{label}</p>
      <p className="mt-1 text-lg font-bold leading-tight text-white">{value}</p>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right font-bold text-slate-900">{value}</dd>
    </div>
  );
}

function CircularsLoading() {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 text-base leading-relaxed text-slate-700 shadow-sm">
      回覧板を読み込んでいます…
    </div>
  );
}

function ErrorView({ message }: { message: string }) {
  return (
    <div>
      <div className="mb-6 text-6xl" aria-hidden="true">
        ⚠️
      </div>
      <h1 className="mb-4 text-2xl font-bold text-red-600">
        ログインできませんでした
      </h1>
      <p className="text-lg leading-relaxed text-slate-600">{message}</p>
    </div>
  );
}

function VoiceAssistantButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="fixed bottom-6 right-6 z-50 inline-flex h-16 w-16 items-center justify-center rounded-full bg-[#D97706] text-white shadow-lg transition hover:bg-amber-700 focus:outline-none focus:ring-4 focus:ring-amber-300"
      aria-label="AI副会長に音声で質問する"
    >
      <span className="text-3xl" aria-hidden="true">
        🎤
      </span>
    </button>
  );
}

function VoiceModal({
  state,
  recognizedQuestion,
  errorMessage,
  onClose,
}: {
  state: VoiceState;
  recognizedQuestion: string;
  errorMessage: string | null;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/50 px-4">
      <div className="w-full max-w-xl rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-xl">
        <h2 className="text-3xl font-bold text-slate-900">お話しください...</h2>

        {state === "listening" && (
          <p className="mt-4 text-xl font-semibold text-[#D97706]">
            マイクがオンです。ゆっくり話してください。
          </p>
        )}

        {state === "processing" && (
          <p className="mt-4 text-xl font-semibold text-[#1E3A5F]">
            AI副会長に確認しています...
          </p>
        )}

        {recognizedQuestion && (
          <p className="mt-5 rounded-2xl bg-amber-50 px-4 py-3 text-left text-lg font-bold leading-relaxed text-slate-900">
            「{recognizedQuestion}」
          </p>
        )}

        {state === "error" && errorMessage && (
          <p className="mt-5 rounded-2xl bg-red-50 px-4 py-3 text-left text-lg font-bold leading-relaxed text-red-700">
            {errorMessage}
          </p>
        )}

        <button
          type="button"
          onClick={onClose}
          className="mt-6 inline-flex min-h-[52px] w-full items-center justify-center rounded-xl border border-slate-300 bg-white px-6 text-lg font-bold text-slate-700 transition hover:bg-slate-50"
        >
          閉じる
        </button>
      </div>
    </div>
  );
}

function AiAnswerPanel({
  answer,
  onClose,
}: {
  answer: string;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/40 px-4">
      <div className="w-full max-w-3xl rounded-3xl border-2 border-[#D97706] bg-white p-8 text-center shadow-xl sm:p-10">
        <p className="text-base font-bold tracking-[0.08em] text-[#D97706]">
          AI副会長の回答
        </p>
        <p className="mt-4 text-[28px] font-extrabold leading-relaxed text-slate-900">
          {answer}
        </p>
        <button
          type="button"
          onClick={onClose}
          className="mt-8 inline-flex min-h-[54px] w-full items-center justify-center rounded-xl bg-[#1E3A5F] px-6 text-lg font-bold text-white shadow-sm transition hover:bg-[#17304D]"
        >
          閉じる
        </button>
      </div>
    </div>
  );
}

export default App;
