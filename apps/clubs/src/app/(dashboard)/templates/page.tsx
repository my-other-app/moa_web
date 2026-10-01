import type { Metadata } from "next";
import { PageHeader } from "@moa/app-kit";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@moa/ui";

import { TemplatesPanel } from "@/features/templates";

export const metadata: Metadata = { title: "Templates" };

export default function TemplatesPage() {
  return (
    <>
      <PageHeader
        title="Templates"
        description="How your tickets and certificates look. Events without a template use the platform default."
      />
      <Tabs defaultValue="ticket">
        <TabsList>
          <TabsTrigger value="ticket">Tickets</TabsTrigger>
          <TabsTrigger value="certificate">Certificates</TabsTrigger>
        </TabsList>
        <TabsContent value="ticket">
          <TemplatesPanel kind="ticket" />
        </TabsContent>
        <TabsContent value="certificate">
          <TemplatesPanel kind="certificate" />
        </TabsContent>
      </Tabs>
    </>
  );
}
