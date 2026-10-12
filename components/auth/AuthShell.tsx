import { ReactNode } from "react";

export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="h-10 w-10 rounded-lg bg-accent/20 text-accent flex items-center justify-center font-bold text-lg mb-3">
            A
          </div>
          <div className="font-semibold tracking-wide">
            AD<span className="text-accent">COMMAND</span>
          </div>
          <div className="text-xs text-muted mt-1">Advertising Command Center</div>
        </div>

        <div className="rounded-xl border border-border bg-surface p-6">
          <h1 className="text-lg font-semibold mb-1">{title}</h1>
          <p className="text-sm text-muted mb-6">{subtitle}</p>
          {children}
        </div>

        <div className="text-center text-sm text-muted mt-5">{footer}</div>
      </div>
    </div>
  );
}
