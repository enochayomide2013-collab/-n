import { User } from 'firebase/auth';
import {
  CheckCircle2,
  ExternalLink,
  FileSpreadsheet,
  Loader2,
  LogOut,
  Plus,
  RefreshCw,
  Search,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { googleSignIn, initAuth, logout } from '../services/googleAuth';
import {
  appendSnapshotQuestionToForm,
  createTerrariumCareForm,
  getForm,
  GoogleFormResource,
  GoogleFormResponseItem,
  listFormResponses,
} from '../services/googleForms';
import type {
  FloraSpecimenInfo,
  TerrariumEnvironmentSnapshot,
} from '../terrarium/math';

interface GoogleFormsModalProps {
  open: boolean;
  onClose: () => void;
  snapshot: TerrariumEnvironmentSnapshot;
  specimens: FloraSpecimenInfo[];
}

export function GoogleFormsModal({
  open,
  onClose,
  snapshot,
  specimens,
}: GoogleFormsModalProps) {
  const [needsAuth, setNeedsAuth] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const [activeForm, setActiveForm] = useState<GoogleFormResource | null>(null);
  const [responses, setResponses] = useState<GoogleFormResponseItem[]>([]);
  const [lookupInput, setLookupInput] = useState('');
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  // Mandatory explicit confirmation dialog before mutating an existing Google Form
  const [confirmAppendOpen, setConfirmAppendOpen] = useState(false);

  useEffect(() => {
    const unsub = initAuth(
      (authedUser) => {
        setUser(authedUser);
        setNeedsAuth(false);
      },
      () => {
        setUser(null);
        setNeedsAuth(true);
      }
    );
    return () => unsub();
  }, []);

  if (!open) return null;

  const handleLogin = async () => {
    setErrorMsg(null);
    setIsLoggingIn(true);
    try {
      const result = await googleSignIn();
      if (result) {
        setUser(result.user);
        setNeedsAuth(false);
      }
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Unable to sign in with Google.'
      );
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    setUser(null);
    setNeedsAuth(true);
    setActiveForm(null);
    setResponses([]);
    setStatusMsg(null);
  };

  const handleCreateCareForm = async () => {
    setErrorMsg(null);
    setStatusMsg(null);
    setBusyAction('create');
    try {
      const created = await createTerrariumCareForm(snapshot, specimens);
      setActiveForm(created);
      setLookupInput(created.formId);
      setResponses([]);
      setStatusMsg('Created a new Google Form tailored to this terrarium seed.');
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Failed to create Google Form.'
      );
    } finally {
      setBusyAction(null);
    }
  };

  const handleLoadForm = async (formIdOrUrl: string) => {
    if (!formIdOrUrl.trim()) return;
    setErrorMsg(null);
    setStatusMsg(null);
    setBusyAction('load');
    try {
      const [form, resps] = await Promise.all([
        getForm(formIdOrUrl),
        listFormResponses(formIdOrUrl),
      ]);
      setActiveForm(form);
      setResponses(resps);
      setStatusMsg(
        `Loaded form with ${form.items?.length ?? 0} questions and ${resps.length} responses.`
      );
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Failed to load Google Form.'
      );
    } finally {
      setBusyAction(null);
    }
  };

  const handleConfirmedAppendQuestion = async () => {
    if (!activeForm) return;
    setConfirmAppendOpen(false);
    setErrorMsg(null);
    setStatusMsg(null);
    setBusyAction('append');
    try {
      const updated = await appendSnapshotQuestionToForm(
        activeForm.formId,
        snapshot,
        activeForm.items?.length ?? 0
      );
      setActiveForm(updated);
      setStatusMsg('Added a new terrarium check-in question to your Google Form.');
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Failed to update Google Form.'
      );
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/65 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="forms-modal-title"
    >
      <div className="w-full max-w-2xl max-h-[88vh] overflow-y-auto rounded-2xl bg-[#111915] border border-white/12 shadow-2xl text-[#eef2ec] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 px-6 py-4 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <FileSpreadsheet className="w-5 h-5 text-[#84cc96]" />
            <h2 id="forms-modal-title" className="font-display text-xl font-medium">
              Terrarium Care Log (Google Forms)
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-[#9aa99f] hover:text-white hover:bg-white/8 transition-colors cursor-pointer"
            aria-label="Close Google Forms drawer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 flex flex-col gap-5">
          {/* Current Terrarium Snapshot Summary */}
          <div className="rounded-xl bg-white/4 border border-white/8 px-4 py-3 flex flex-wrap items-center justify-between gap-2 text-xs text-[#b8c4bc]">
            <span>
              Seed #{snapshot.seed} · {snapshot.timeLabel} ·{' '}
              <span className="capitalize">{snapshot.weather}</span>
            </span>
            <span className="font-mono-tabular">
              {snapshot.humidity}% RH · {snapshot.temperatureC.toFixed(1)}°C ·{' '}
              {specimens.length} specimens
            </span>
          </div>

          {errorMsg && (
            <div className="rounded-xl bg-red-950/60 border border-red-500/35 px-4 py-3 text-xs text-red-200">
              {errorMsg}
            </div>
          )}

          {statusMsg && (
            <div className="rounded-xl bg-[#84cc96]/12 border border-[#84cc96]/35 px-4 py-3 text-xs text-[#b4efc2] flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-[#84cc96]" />
              <span>{statusMsg}</span>
            </div>
          )}

          {needsAuth ? (
            <div className="flex flex-col items-start gap-4 py-2">
              <p className="text-sm text-[#c6d1ca] leading-relaxed">
                Sign in with your Google account to create a shareable botanical care
                and specimen observation form directly from this terrarium, or review
                submitted responses.
              </p>

              {/* Official Google Sign-In button */}
              <button
                type="button"
                onClick={handleLogin}
                disabled={isLoggingIn}
                className="gsi-material-button"
              >
                <div className="gsi-material-button-state" />
                <div className="gsi-material-button-content-wrapper">
                  <div className="gsi-material-button-icon">
                    <svg
                      version="1.1"
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 48 48"
                      style={{ display: 'block' }}
                    >
                      <path
                        fill="#EA4335"
                        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                      />
                      <path
                        fill="#4285F4"
                        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                      />
                      <path
                        fill="#34A853"
                        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                      />
                      <path fill="none" d="M0 0h48v48H0z" />
                    </svg>
                  </div>
                  <span className="gsi-material-button-contents">
                    {isLoggingIn ? 'Signing in...' : 'Sign in with Google'}
                  </span>
                </div>
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-5">
              {/* Signed-in account bar */}
              <div className="flex items-center justify-between gap-3 text-xs text-[#aab8ae]">
                <span>
                  Signed in as{' '}
                  <strong className="text-[#eef2ec] font-medium">
                    {user?.email ?? user?.displayName ?? 'Google Account'}
                  </strong>
                </span>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="inline-flex items-center gap-1.5 text-[#aab8ae] hover:text-white cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Sign Out</span>
                </button>
              </div>

              {/* Primary Action: Create New Form OR Open Existing Form */}
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  type="button"
                  onClick={handleCreateCareForm}
                  disabled={busyAction !== null}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#84cc96] text-[#0c1410] text-xs font-semibold hover:bg-[#99dca9] transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
                >
                  {busyAction === 'create' ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Plus className="w-4 h-4" />
                  )}
                  <span>Create New Care Form</span>
                </button>

                <div className="flex items-center gap-2 flex-1">
                  <input
                    type="text"
                    value={lookupInput}
                    onChange={(e) => setLookupInput(e.target.value)}
                    placeholder="Paste Google Form ID or URL..."
                    className="flex-1 px-3 py-2.5 rounded-xl bg-white/5 border border-white/12 text-xs text-[#eef2ec] placeholder:text-[#7c8a81] focus:outline-none focus:border-[#84cc96]"
                  />
                  <button
                    type="button"
                    onClick={() => handleLoadForm(lookupInput)}
                    disabled={busyAction !== null || !lookupInput.trim()}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-white/8 hover:bg-white/14 border border-white/12 text-xs font-medium text-[#eef2ec] transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
                  >
                    {busyAction === 'load' ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Search className="w-3.5 h-3.5" />
                    )}
                    <span>Load Form</span>
                  </button>
                </div>
              </div>

              {/* Active Form Details & Responses */}
              {activeForm && (
                <div className="border-t border-white/10 pt-4 flex flex-col gap-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold text-[#eef2ec]">
                        {activeForm.info.title}
                      </h3>
                      <p className="text-xs text-[#9aa99f] mt-0.5 font-mono-tabular">
                        Form ID: {activeForm.formId}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleLoadForm(activeForm.formId)}
                        disabled={busyAction !== null}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/6 hover:bg-white/12 border border-white/10 text-xs text-[#dce5df] cursor-pointer"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>Refresh</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setConfirmAppendOpen(true)}
                        disabled={busyAction !== null}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/8 hover:bg-white/14 border border-white/12 text-xs text-[#dce5df] cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5 text-[#84cc96]" />
                        <span>Add Snapshot Check-In</span>
                      </button>

                      <a
                        href={activeForm.responderUri}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#84cc96]/18 hover:bg-[#84cc96]/28 border border-[#84cc96]/35 text-xs font-medium text-[#a6e7b6]"
                      >
                        <span>Open Form</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  </div>

                  {/* Form Questions */}
                  <div className="flex flex-col gap-2">
                    <div className="text-xs font-medium text-[#aab8ae]">
                      Form Questions ({activeForm.items?.length ?? 0})
                    </div>
                    <div className="divide-y divide-white/8 rounded-xl border border-white/10 bg-white/3">
                      {(activeForm.items ?? []).map((item, idx) => (
                        <div key={item.itemId ?? idx} className="px-4 py-2.5 text-xs">
                          <div className="font-medium text-[#eef2ec]">
                            {idx + 1}. {item.title || 'Untitled Question'}
                          </div>
                          {item.description && (
                            <div className="text-[#9aa99f] mt-0.5">
                              {item.description}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Submitted Responses */}
                  <div className="flex flex-col gap-2">
                    <div className="text-xs font-medium text-[#aab8ae]">
                      Submitted Care Responses ({responses.length})
                    </div>
                    {responses.length === 0 ? (
                      <div className="rounded-xl border border-white/8 bg-white/3 px-4 py-3 text-xs text-[#8f9f94]">
                        No care log responses submitted yet. Use "Open Form" above to log
                        your first observation.
                      </div>
                    ) : (
                      <div className="divide-y divide-white/8 rounded-xl border border-white/10 bg-white/3">
                        {responses.slice(0, 5).map((resp) => {
                          const answerValues = Object.values(resp.answers ?? {})
                            .flatMap(
                              (a) => a.textAnswers?.answers?.map((x) => x.value) ?? []
                            )
                            .join(' · ');
                          return (
                            <div
                              key={resp.responseId}
                              className="px-4 py-2.5 text-xs flex flex-col gap-1"
                            >
                              <div className="flex items-center justify-between text-[#9aa99f] font-mono-tabular">
                                <span>
                                  {new Date(resp.lastSubmittedTime).toLocaleString()}
                                </span>
                                <span>{resp.respondentEmail || 'Contributor'}</span>
                              </div>
                              <div className="text-[#eef2ec]">
                                {answerValues || 'Submitted'}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Explicit Confirmation Modal before mutating an existing Google Form */}
      {confirmAppendOpen && activeForm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          role="alertdialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-2xl bg-[#15201b] border border-white/15 p-6 shadow-2xl flex flex-col gap-4">
            <h3 className="text-base font-semibold text-[#eef2ec]">
              Update Google Form?
            </h3>
            <p className="text-xs text-[#c6d1ca] leading-relaxed">
              This will add a new observation check-in question to{' '}
              <strong className="text-white">"{activeForm.info.title}"</strong>{' '}
              containing your current terrarium snapshot (Seed #{snapshot.seed},{' '}
              {snapshot.timeLabel}, {snapshot.weather}, {snapshot.humidity}% RH).
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmAppendOpen(false)}
                className="px-4 py-2 rounded-lg bg-white/8 hover:bg-white/14 text-xs font-medium text-[#dce5df] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmedAppendQuestion}
                className="px-4 py-2 rounded-lg bg-[#84cc96] hover:bg-[#99dca9] text-xs font-semibold text-[#0c1410] cursor-pointer"
              >
                Confirm Update
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
