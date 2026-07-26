import React from 'react';

interface Props {
  children: React.ReactNode;
  /** Shown in the fallback so the user knows what broke, e.g. "Operations". */
  label?: string;
  /** Bump this (e.g. the active view) to clear a previous crash automatically. */
  resetKey?: string | number;
}

interface State {
  error: Error | null;
}

/**
 * Catches render-time exceptions so one bad record can't blank the entire app.
 *
 * React unmounts the whole tree when a render throws, which previously left
 * crews staring at a white screen with no way back other than a hard reload.
 * Wrapping each view means a failure is contained to that view and the rest of
 * the navigation keeps working.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Render error caught by ErrorBoundary:', error, info.componentStack);
  }

  componentDidUpdate(prev: Props) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20 px-6 text-center">
        <div className="w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center">
          <svg className="w-7 h-7 text-rose-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
        </div>
        <div>
          <p className="text-[11px] font-black uppercase tracking-widest text-rose-500">
            {this.props.label ? `${this.props.label} failed to load` : 'Something went wrong'}
          </p>
          <p className="text-[11px] font-semibold text-slate-500 mt-2 max-w-md break-words">{this.state.error.message}</p>
          <p className="text-[10px] text-slate-400 mt-1">Your data is safe — switch tabs or reload to continue.</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => this.setState({ error: null })}
            className="px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest bg-brand/10 text-brand border border-brand/20 hover:bg-brand/20 transition-all"
          >
            Try Again
          </button>
          <button
            onClick={() => location.reload()}
            className="px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-500 border border-slate-300 hover:bg-slate-100 transition-all"
          >
            Reload
          </button>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
