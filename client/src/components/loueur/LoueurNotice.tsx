import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";

type NoticeKind = "info" | "confirm";

type NoticeState = {
  kind: NoticeKind;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "default" | "danger";
};

type ConfirmOptions = {
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "default" | "danger";
};

export type LoueurNoticeApi = {
  alert: (title: string, message?: string) => Promise<void>;
  confirm: (title: string, message?: string, opts?: ConfirmOptions) => Promise<boolean>;
};

const LoueurNoticeContext = createContext<LoueurNoticeApi | null>(null);

export function useLoueurNotice(): LoueurNoticeApi {
  const ctx = useContext(LoueurNoticeContext);
  if (ctx) return ctx;
  return {
    alert: async (title, message) => {
      window.alert(message ? `${title}\n\n${message}` : title);
    },
    confirm: async (title, message) => window.confirm(message ? `${title}\n\n${message}` : title),
  };
}

export function LoueurNoticeProvider({ children }: { children: ReactNode }) {
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const resolverRef = useRef<((value: boolean) => void) | null>(null);

  const close = useCallback((ok: boolean) => {
    const resolve = resolverRef.current;
    resolverRef.current = null;
    setNotice(null);
    resolve?.(ok);
  }, []);

  const alertFn = useCallback((title: string, message?: string) => {
    return new Promise<void>((resolve) => {
      resolverRef.current = () => resolve();
      setNotice({
        kind: "info",
        title: message ? title : "Information",
        message: message || title,
      });
    });
  }, []);

  const confirmFn = useCallback((title: string, message?: string, opts?: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
      setNotice({
        kind: "confirm",
        title: message ? title : "Confirmation",
        message: message || title,
        confirmLabel: opts?.confirmLabel,
        cancelLabel: opts?.cancelLabel,
        tone: opts?.tone,
      });
    });
  }, []);

  return (
    <LoueurNoticeContext.Provider value={{ alert: alertFn, confirm: confirmFn }}>
      {children}
      {notice ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            aria-label="Fermer"
            className="absolute inset-0 bg-black/25"
            onClick={() => close(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="loueur-notice-title"
            className="relative w-full max-w-[420px] rounded-2xl border border-gray-100 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.12)]"
          >
            <h2 id="loueur-notice-title" className="text-[17px] font-semibold tracking-tight text-gray-900">
              {notice.title}
            </h2>
            {notice.message ? (
              <p className="mt-2 text-[15px] leading-relaxed text-gray-600 whitespace-pre-line">
                {notice.message}
              </p>
            ) : null}
            <div className="mt-6 flex justify-end gap-2">
              {notice.kind === "confirm" ? (
                <button
                  type="button"
                  onClick={() => close(false)}
                  className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  {notice.cancelLabel || "Annuler"}
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => close(true)}
                className={`rounded-xl px-4 py-2 text-sm font-semibold text-white ${
                  notice.tone === "danger"
                    ? "bg-red-600 hover:bg-red-700"
                    : "bg-gray-900 hover:bg-gray-800"
                }`}
              >
                {notice.kind === "confirm" ? notice.confirmLabel || "Confirmer" : "OK"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </LoueurNoticeContext.Provider>
  );
}
