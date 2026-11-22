import { api } from "@moa/app-kit";

import { gamesOverviewSchema, type GamesRange } from "./schemas";

export async function fetchGamesOverview(range: GamesRange) {
  return gamesOverviewSchema.parse(
    await api.get<unknown>("/api/v1/admin/games/overview", { query: { from: range.from || undefined, to: range.to || undefined } }),
  );
}
