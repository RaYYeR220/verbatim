import { useActionMutation, useActionQuery } from "@agent-native/core/client/hooks";
import { useSetPageTitle } from "@agent-native/toolkit/app-shell/header-actions";
import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";

interface StudyRow {
  id: string;
  title: string;
  question: string | null;
  updatedAt: string;
  notes: number;
  themes: number;
  sources: number;
}

export function meta() {
  return [{ title: "Studies · Verbatim" }];
}

export default function StudiesRoute() {
  useSetPageTitle("Studies");
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { data, isLoading } = useActionQuery("list-studies", {} as never);
  const studies = (data as { studies?: StudyRow[] } | undefined)?.studies ?? [];
  const [creating, setCreating] = useState(params.get("new") === "1");
  const [title, setTitle] = useState("");
  const [question, setQuestion] = useState("");
  const create = useActionMutation("create-study");

  useEffect(() => {
    if (params.get("new") === "1") setCreating(true);
  }, [params]);

  const submit = async () => {
    if (!title.trim()) return;
    const res = (await create.mutateAsync({ title: title.trim(), ...(question.trim() ? { question: question.trim() } : {}) } as never)) as { id: string };
    navigate(`/studies/${res.id}`);
  };

  return (
    <div className="min-h-full bg-[var(--vb-ground)]">
      <div className="mx-auto max-w-[980px] px-6 pb-20 pt-12">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="font-[family-name:var(--vb-display)] text-[44px] font-medium leading-none tracking-[-0.04em] text-[var(--vb-ink)]">Studies</h1>
            <p className="mt-3 max-w-[520px] text-[14px] leading-relaxed text-[var(--vb-ink2)]">
              One board per question. Every note on a board is a passage a customer actually said, and every count opens to the people behind it.
            </p>
          </div>
          {!creating ? (
            <button type="button" onClick={() => setCreating(true)} className="h-9 shrink-0 rounded-full bg-[var(--vb-ink)] px-4 text-[13px] text-[var(--vb-ground-hi)]">
              New study
            </button>
          ) : null}
        </div>

        {creating ? (
          <form
            className="mt-8 flex flex-col gap-2.5 border-y border-[var(--vb-hair)] py-5"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Name it — e.g. Q4 onboarding interviews" className="h-10 rounded-[2px] border border-[var(--vb-hair)] bg-[var(--vb-card)] px-3 text-[15px] outline-none focus:border-[var(--vb-ink3)]" />
            <input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="What do you want to learn? (optional) — e.g. Why do new teams stall in their first month?" className="h-10 rounded-[2px] border border-[var(--vb-hair)] bg-[var(--vb-card)] px-3 text-[14px] outline-none focus:border-[var(--vb-ink3)]" />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => { setCreating(false); setParams({}); }} className="h-9 px-3 text-[13px] text-[var(--vb-ink3)]">
                Cancel
              </button>
              <button type="submit" disabled={!title.trim() || create.isPending} className="h-9 rounded-full bg-[var(--vb-ink)] px-4 text-[13px] text-[var(--vb-ground-hi)] disabled:opacity-40">
                Create study
              </button>
            </div>
          </form>
        ) : null}

        <ul className="mt-8 divide-y divide-[var(--vb-hair)] border-y border-[var(--vb-hair)]">
          {isLoading && studies.length === 0 ? <li className="py-6 font-[family-name:var(--vb-mono)] text-[12px] text-[var(--vb-ink3)]">Loading…</li> : null}
          {!isLoading && studies.length === 0 ? (
            <li className="py-10 text-[14px] text-[var(--vb-ink2)]">No studies yet. Create one and drop in your first interviews or reviews.</li>
          ) : null}
          {studies.map((s) => (
            <li key={s.id}>
              <Link to={`/studies/${s.id}`} className="group flex items-baseline gap-6 py-5">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-[family-name:var(--vb-display)] text-[20px] font-medium tracking-[-0.02em] text-[var(--vb-ink)] group-hover:underline group-hover:underline-offset-4">{s.title}</p>
                  {s.question ? <p className="mt-1 truncate text-[13px] text-[var(--vb-ink3)]">{s.question}</p> : null}
                </div>
                <p className="shrink-0 font-[family-name:var(--vb-mono)] text-[11.5px] text-[var(--vb-ink3)] tabular-nums">
                  {s.sources} sources · {s.notes} quotes · {s.themes} themes
                </p>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
