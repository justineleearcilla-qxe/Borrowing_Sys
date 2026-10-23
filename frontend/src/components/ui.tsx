import {
  ButtonHTMLAttributes,
  CSSProperties,
  createContext,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
  useContext,
  useEffect,
  useId,
  useRef,
} from "react";
import clsx from "clsx";
import { Icon } from "./Icon";

const FieldControlId = createContext<string | undefined>(undefined);

type ButtonVariant = "primary" | "secondary" | "danger" | "success" | "ghost";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: "sm" | "md";
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={clsx(
        "btn",
        `btn-${variant}`,
        size === "sm" && "btn-sm",
        className,
      )}
      {...rest}
    />
  );
}

export function Card({
  className,
  style,
  children,
}: {
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  return (
    <div className={clsx("card", className)} style={style}>
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  actions,
}: {
  title: string;
  actions?: ReactNode;
}) {
  return (
    <div className="card-header">
      <h2 className="card-title">{title}</h2>
      {actions}
    </div>
  );
}

interface BadgeProps {
  tone?: "gray" | "blue" | "green" | "yellow" | "red" | "purple";
  children: ReactNode;
  className?: string;
}

export function Badge({ tone = "gray", children, className }: BadgeProps) {
  return (
    <span className={clsx("badge", `badge-${tone}`, className)}>
      {children}
    </span>
  );
}

export function Label({
  htmlFor,
  children,
}: {
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <label className="label" htmlFor={htmlFor}>
      {children}
    </label>
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  const fieldControlId = useContext(FieldControlId);
  return (
    <input
      {...props}
      id={props.id ?? fieldControlId}
      className={clsx("input", props.className)}
    />
  );
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  const fieldControlId = useContext(FieldControlId);
  return (
    <select
      {...props}
      id={props.id ?? fieldControlId}
      className={clsx("select", props.className)}
    />
  );
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const fieldControlId = useContext(FieldControlId);
  return (
    <textarea
      {...props}
      id={props.id ?? fieldControlId}
      className={clsx("textarea", props.className)}
    />
  );
}

export function Field({
  label,
  children,
  htmlFor,
}: {
  label: string;
  children: ReactNode;
  htmlFor?: string;
}) {
  const generatedId = useId();
  const controlId = htmlFor ?? generatedId;
  return (
    <div>
      <Label htmlFor={controlId}>{label}</Label>
      <FieldControlId.Provider value={controlId}>
        {children}
      </FieldControlId.Provider>
    </div>
  );
}

export function Alert({
  tone = "info",
  children,
  onDismiss,
}: {
  tone?: "info" | "success" | "error" | "warning";
  children: ReactNode;
  onDismiss?: () => void;
}) {
  const tones = {
    info: "border-primary-200 bg-primary-50 text-primary-900",
    success: "border-emerald-300 bg-emerald-50 text-emerald-800",
    error: "border-red-300 bg-red-50 text-red-800",
    warning: "border-amber-300 bg-amber-50 text-amber-900",
  } as const;
  return (
    <div
      className={clsx(
        "flex items-start justify-between gap-3 border px-4 py-3 text-sm font-medium",
        tones[tone],
      )}
    >
      <div className="min-w-0">{children}</div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="-mr-1 -mt-0.5 shrink-0 rounded p-0.5 opacity-70 transition-opacity hover:opacity-100"
        >
          <Icon name="close" className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const previouslyFocused =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const dialog = dialogRef.current;
    closeButtonRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !dialog) return;

      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const focusIsOutside = !dialog.contains(document.activeElement);
      if (
        event.shiftKey &&
        (document.activeElement === first || focusIsOutside)
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last || focusIsOutside)
      ) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, [open]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-900/60 p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={clsx(
          "card w-full shadow-xl",
          wide ? "max-w-3xl" : "max-w-lg",
        )}
      >
        <div className="card-header">
          <h2 id={titleId} className="card-title">
            {title}
          </h2>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="btn btn-ghost btn-sm"
            aria-label="Close"
          >
            Close
          </button>
        </div>
        <div className="card-body space-y-4">{children}</div>
        {footer && (
          <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 px-4 py-3 sm:px-5">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg
      className={clsx("animate-spin", className ?? "h-5 w-5")}
      viewBox="0 0 24 24"
      fill="none"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
      />
    </svg>
  );
}

export function FullPageSpinner() {
  return (
    <div className="flex min-h-screen items-center justify-center text-primary-800">
      <Spinner className="h-8 w-8" />
    </div>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 border border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center">
      <p className="text-sm font-semibold text-slate-600">{title}</p>
      {hint && <p className="text-xs text-slate-400">{hint}</p>}
    </div>
  );
}

export function StatCard({
  label,
  value,
  tone = "default",
  hint,
}: {
  label: string;
  value: ReactNode;
  tone?: "default" | "red" | "green" | "amber";
  hint?: string;
}) {
  const tones = {
    default: "text-primary-800",
    red: "text-red-600",
    green: "text-emerald-600",
    amber: "text-amber-600",
  } as const;
  return (
    <Card className="p-4 sm:p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className={clsx("mt-1 text-2xl font-bold tabular-nums", tones[tone])}>
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
    </Card>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 sm:text-[28px]">
          {title}
        </h1>
        {description && (
          <p className="mt-1 text-sm text-slate-500">{description}</p>
        )}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
