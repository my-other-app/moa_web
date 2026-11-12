import type { Metadata } from "next";

import { DocsLinksPage } from "@/features/integrations";

export const metadata: Metadata = { title: "Docs links" };

export default function DocsLinksRoute() {
  return <DocsLinksPage />;
}
