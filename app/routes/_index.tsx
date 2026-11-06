import { LandingPage } from "@/components/landing/LandingPage";

const TITLE = "Verbatim — every insight, in the customer’s own words";
const DESCRIPTION =
  "Drop in interviews, calls and feedback. Verbatim’s agent cuts every source into exact quotes and sorts them into themes with you, live, on one board. Nothing on it is paraphrased.";

export function meta() {
  return [
    { title: TITLE },
    { name: "description", content: DESCRIPTION },
    { property: "og:type", content: "website" },
    { property: "og:site_name", content: "Verbatim" },
    { property: "og:title", content: TITLE },
    { property: "og:description", content: DESCRIPTION },
    { name: "twitter:card", content: "summary" },
    { name: "twitter:title", content: TITLE },
    { name: "twitter:description", content: DESCRIPTION },
  ];
}

export default function IndexRoute() {
  return <LandingPage />;
}
