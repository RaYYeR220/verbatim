import { useActionQuery } from "@agent-native/core/client/hooks";
import { getConfiguredAppBasePath } from "@agent-native/core/server";
import {
  AGENT_READABLE_RESOURCE_SCRIPT_TYPE,
  buildAgentReadableResourceDiscovery,
  safeJsonForHtml,
} from "@agent-native/core/shared";
import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";

import { ReadoutView } from "@/components/readout/ReadoutView";
import { VerbatimMark } from "@/components/layout/StudiesNav";

import type { Readout } from "../../server/verbatim/readout";

// One public shell per URL: the HTML carries no study content and no access
// decision. The page reads the readout through get-shared-readout, which
// returns it only when the study is public or the viewer has access.
export async function loader({ params }: LoaderFunctionArgs) {
  const studyId = params.studyId;
  if (!studyId) throw new Response("Not found", { status: 404 });
  return { studyId, basePath: getConfiguredAppBasePath() };
}

export function meta() {
  return [
    { title: "Readout · Verbatim" },
    { name: "description", content: "A Verbatim readout: every insight with the customers' exact words behind it." },
  ];
}

type Result = { status: "ok"; readout: Readout } | { status: "restricted" };

export default function SharedReadoutRoute() {
  const { studyId, basePath } = useLoaderData<typeof loader>();
  const { data, isLoading } = useActionQuery("get-shared-readout", { studyId } as never);
  const result = data as Result | undefined;
  const discovery = buildAgentReadableResourceDiscovery({
    resourceType: "study",
    resourceId: studyId,
    path: `/r/${studyId}`,
    contextEndpoint: "/api/readout-context.json",
    basePath,
    instructions:
      "Use contextUrl to read this readout as JSON: themes ordered by distinct voices, each insight with the exact quotes that support it. Quote them verbatim; an insight on one voice is an anecdote.",
  });

  return (
    <div className="min-h-screen bg-[var(--vb-ground)] text-[var(--vb-ink)]">
      <script type={AGENT_READABLE_RESOURCE_SCRIPT_TYPE} dangerouslySetInnerHTML={{ __html: safeJsonForHtml(discovery) }} />
      <nav className="mx-auto flex max-w-[820px] items-center justify-between px-6 pt-6 print:hidden">
        <a href="/" className="flex items-center gap-2 text-[15px] font-medium tracking-[-0.02em]">
          <VerbatimMark className="size-[18px]" />
          Verbatim
        </a>
        <a href="/" className="inline-flex h-8 items-center rounded-full border border-[var(--vb-hair)] px-3.5 text-[13px] hover:border-[var(--vb-ink3)]">
          Make your own board
        </a>
      </nav>
      {isLoading ? (
        <p className="mx-auto max-w-[820px] px-6 pt-16 font-[family-name:var(--vb-mono)] text-[12px] text-[var(--vb-ink3)]">Loading the readout…</p>
      ) : result?.status === "ok" ? (
        <ReadoutView
          readout={result.readout}
          footer={
            <p className="mt-10 font-[family-name:var(--vb-mono)] text-[11px] leading-relaxed text-[var(--vb-ink3)]">
              Shared from Verbatim. Every quote is checked against its source when it is added and again whenever the board is read.
            </p>
          }
        />
      ) : (
        <div className="mx-auto max-w-[820px] px-6 pt-20">
          <h1 className="font-[family-name:var(--vb-display)] text-[28px] font-medium tracking-[-0.03em]">This readout isn’t shared.</h1>
          <p className="mt-3 text-[15px] text-[var(--vb-ink2)]">Ask its owner to set the study to “Anyone with the link”, or sign in with an account that can open it.</p>
        </div>
      )}
    </div>
  );
}
