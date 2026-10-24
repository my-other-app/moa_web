"use client";

import { Loader2Icon, MessageSquareQuoteIcon, StarIcon } from "lucide-react";
import { PersonAvatar, formatDate, formatNumber } from "@moa/app-kit";
import { Button, CardLabel, EmptyState, FigurePanel, ProgressBar, Skeleton, cn } from "@moa/ui";

import { REVIEW_PAGE_SIZE, useEventReviews } from "../queries";
import { ratingDistribution, type Review } from "../schemas";

/**
 * What attendees said: the average and how the stars fall, then every
 * review in the guests' own words, newest first.
 *
 * The API has returned these since ratings existed and nothing ever called
 * it, so a club saw an average and could not read a word of the feedback
 * behind it. Collecting reviews nobody can read is worse than not
 * collecting them.
 */
function Stars({ value, size = "sm" }: { value: number; size?: "sm" | "md" }) {
  return (
    <span className="inline-flex items-center gap-0.5" role="img" aria-label={`${value.toFixed(1)} out of 5`}>
      {[1, 2, 3, 4, 5].map((star) => (
        <StarIcon
          key={star}
          aria-hidden="true"
          className={cn(
            size === "md" ? "size-4" : "size-3.5",
            // Rounded, so a 4.5 shows five lit stars rather than a half-filled one the icon set cannot draw.
            Math.round(value) >= star ? "text-caution fill-current" : "text-line",
          )}
        />
      ))}
    </span>
  );
}

function ReviewRow({ review }: { review: Review }) {
  const name = review.user?.profile?.full_name || review.user?.full_name || review.user?.username || "Someone";

  return (
    <li className="border-line-soft flex gap-3 border-t px-4 py-3 first:border-t-0">
      {/* Their photo first: a reviewer with one used to show as initials,
          since only the avatar they picked was read. */}
      <PersonAvatar
        name={name}
        photo={review.user?.profile?.profile_pic}
        avatar={review.user?.profile?.avatar}
        className="size-8"
        fallbackClassName="bg-muted text-muted-foreground font-mono text-[12px] font-semibold"
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="text-ink truncate text-[13px] font-medium">{name}</span>
          <Stars value={review.rating} />
          {review.created_at ? <span className="text-ink-3 font-mono text-[11px]">{formatDate(review.created_at)}</span> : null}
        </div>
        {review.review?.trim() ? (
          <p className="text-ink-2 mt-1 text-[12.5px] leading-[1.55] text-pretty">{review.review}</p>
        ) : (
          // A rating with no words is still signal; saying so beats a blank row.
          <p className="text-ink-3 mt-1 text-[12px]">Rated without a comment.</p>
        )}
      </div>
    </li>
  );
}

export function EventReviewsPanel({
  eventId,
  rating,
  totalRatings,
  finished,
}: {
  eventId: number;
  /** The event's own average, which is authoritative over the loaded page. */
  rating?: number | null;
  totalRatings?: number | null;
  /** Whether the event has finished, so the empty state can say what happens next. */
  finished?: boolean;
}) {
  const { data, isPending, isError, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } = useEventReviews(eventId);

  const reviews = data?.pages.flatMap((page) => page.items) ?? [];
  const total = totalRatings ?? null;
  // The distribution is only honest once every review is in hand; over one
  // page of twenty it would describe the page, not the event.
  const complete = total !== null && reviews.length >= total;
  const distribution = ratingDistribution(reviews);
  // The event's own average when it has one; otherwise the loaded reviews', rather than a 0.0 above four stars.
  const average = rating ?? (reviews.length ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length : 0);

  return (
    <FigurePanel className="overflow-hidden p-0">
      <div className="border-line-soft flex items-center justify-between gap-2 border-b px-4 py-3">
        <CardLabel>What attendees said</CardLabel>
        {reviews.length ? (
          <span className="text-ink-3 font-mono text-[11px] tabular-nums">
            {total !== null ? `${formatNumber(total)} ${total === 1 ? "rating" : "ratings"}` : `${formatNumber(reviews.length)} loaded`}
          </span>
        ) : null}
      </div>

      {isPending ? (
        <div className="grid gap-2 p-4">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-14 rounded-xl" />
          ))}
        </div>
      ) : isError ? (
        <EmptyState
          size="sm"
          title="The reviews could not load"
          description="Try again in a moment."
          action={
            <Button variant="secondary" size="sm" onClick={() => void refetch()}>
              Try again
            </Button>
          }
        />
      ) : reviews.length === 0 ? (
        <EmptyState
          size="sm"
          icon={<MessageSquareQuoteIcon />}
          title="No reviews yet"
          description={
            finished
              ? "Guests who attended can rate the event and say what they thought in the app. Their words land here as they come in."
              : "Guests can rate the event once it has finished. Their ratings and words land here."
          }
        />
      ) : (
        <>
          <div className="border-line-soft flex flex-wrap items-center gap-x-8 gap-y-4 border-b px-4 py-4">
            <div>
              <p className="text-ink font-mono text-[34px] leading-none tracking-[-0.03em] tabular-nums">{average.toFixed(1)}</p>
              <div className="mt-2">
                <Stars value={average} size="md" />
              </div>
              <p className="text-ink-3 mt-1 text-[11.5px]">{rating != null ? "average of every rating" : "average of those loaded"}</p>
            </div>
            {complete ? (
              <ul className="grid min-w-[13rem] flex-1 gap-1.5">
                {distribution.map((count, i) => {
                  const star = 5 - i;
                  return (
                    <li key={star} className="flex items-center gap-2.5 text-[12px]">
                      <span className="text-ink-2 w-12 shrink-0">{star} star</span>
                      <ProgressBar value={count} max={Math.max(1, reviews.length)} tone={count === 0 ? "muted" : "caution"} height={7} className="flex-1" label={`${count} of ${reviews.length} rated ${star}`} />
                      <span className="text-ink-3 w-8 shrink-0 text-right font-mono text-[11px] tabular-nums">{formatNumber(count)}</span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-ink-3 max-w-[36ch] flex-1 text-[11.5px] leading-[1.5]">How the stars fall shows once every review is loaded; there are more than this page holds.</p>
            )}
          </div>

          <ul>
            {reviews.map((review) => (
              <ReviewRow key={review.id} review={review} />
            ))}
          </ul>

          {hasNextPage ? (
            <div className="border-line-soft border-t px-4 py-2.5">
              <Button variant="secondary" size="sm" className="w-full" disabled={isFetchingNextPage} onClick={() => void fetchNextPage()}>
                {isFetchingNextPage ? <Loader2Icon className="animate-spin" /> : null}
                Load {REVIEW_PAGE_SIZE} more
              </Button>
            </div>
          ) : null}
        </>
      )}
    </FigurePanel>
  );
}
