import { EventConsole } from "@/features/console";

/**
 * Every page under an event renders inside its console: the name, the
 * status, the notices, the actions and the rail of sections. The pages
 * themselves only draw their own panel.
 */
export default async function EventLayout({
  params,
  children,
}: {
  params: Promise<{ eventId: string }>;
  children: React.ReactNode;
}) {
  const { eventId } = await params;
  return <EventConsole eventId={Number(eventId)}>{children}</EventConsole>;
}
