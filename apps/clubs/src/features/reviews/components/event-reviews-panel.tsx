"use client";

import Image from "next/image";
import { Loader2Icon, MessageSquareQuoteIcon, StarIcon } from "lucide-react";
import { formatDate, formatNumber, initials, pickImage } from "@moa/app-kit";
import {
  Avatar,
  AvatarFallback,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  ProgressMeter,
  Skeleton,
  cn,
} from "@moa/ui";
import { hoverLift, pressable, stagger } from "@moa/ui/motion";

import { REVIEW_PAGE_SIZE, useEventReviews } from "../queries";
import { ratingDistribution, type Review } from "../schemas";

/**
 * What attendees said.
 *
 * The API has returned these since ratings existed, behind an endpoint built
 * for club admins, and nothing ever called it -- so a club saw an average and
 * could not read a single word of the feedback behind it. Collecting reviews
 * nobody can read is worse than not collecting them.
 */
function Stars({ value, className }: { value: number; className?: string }) {
  return (
    <span
      className={cn("inline-flex items-center gap-0.5", className)}
      aria-label={`${value.toFixed(1)} out of 5`}
    >
      {[1, 2, 3, 4, 5].map((star) => (
        <StarIcon
          key={star}
          aria-hidden="true"
          className={cn(
            "size-3.5",
            // Rounded, so a 4.5 shows five lit stars rather than four and a
            // half-filled one the icon set cannot draw.
            Math.round(value) >= star
              ? "fill-amber-400 text-amber-400"
              : "text-muted-foreground/30"
          )}
        />
      ))}
    </span>
  );
}

function ReviewRow({ review, index }: { review: Review; index: number }) {
  const name =
    review.user?.profile?.full_name ||
    review.user?.full_name ||
    review.user?.username ||
    "Someone";
  const avatar = pickImage(review.user?.profile?.avatar, ["thumbnail", "medium"]);

  return (
    <div
      style={stagger(index)}
      className={cn(
        "animate-in fade-in-0 slide-in-from-bottom-1 flex gap-3 rounded-lg border p-3 duration-300 motion-reduce:animate-none",
        hoverLift
      )}
    >
      {avatar ? (
        <Image
          src={avatar}
          alt=""
          width={36}
          height={36}
          className="size-9 shrink-0 rounded-full object-cover"
          unoptimized
        />
      ) : (
        <Avatar className="size-9 shrink-0">
          <AvatarFallback className="text-[11px]">{initials(name)}</AvatarFallback>
        </Avatar>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <p className="truncate text-sm font-medium">{name}</p>
          <Stars value={review.rating} />
          {review.created_at ? (
            <span className="text-muted-foreground text-xs">
              {formatDate(review.created_at)}
            </span>
          ) : null}
        </div>
        {review.review?.trim() ? (
          <p className="mt-1 text-sm text-pretty">{review.review}</p>
        ) : (
          // A rating with no words is still signal; saying so beats a blank row.
          <p className="text-muted-foreground mt-1 text-xs italic">
            Rated without a comment.
          </p>
        )}
      </div>
    </div>
  );
}

export function EventReviewsPanel({
  eventId,
  rating,
  totalRatings,
}: {
  eventId: number;
  /** The event's own average, which is authoritative over the loaded page. */
  rating?: number | null;
  totalRatings?: number | null;
}) {
  const { data, isPending, isError, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useEventReviews(eventId);

  const reviews = data?.pages.flatMap((page) => page.items) ?? [];
  const total = totalRatings ?? null;
  // The distribution is only honest once every review is in hand; over one
  // page of twenty it would describe the page, not the event.
  const complete = total !== null && reviews.length >= total;
  const distribution = ratingDistribution(reviews);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">What attendees said</CardTitle>
        <CardDescription>
          Ratings and reviews left after the event.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-5">
        {isPending ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full rounded-lg" />
            ))}
          </div>
        ) : isError ? (
          <EmptyState
            tone="muted"
            title="Could not load reviews"
            description="Try reloading the page."
          />
        ) : reviews.length === 0 ? (
          <EmptyState
            tone="muted"
            icon={<MessageSquareQuoteIcon />}
            title="No reviews yet"
            description="Attendees can rate the event once it has finished."
          />
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-6 rounded-lg border p-4">
              <div>
                <p className="text-3xl leading-none font-semibold tabular-nums">
                  {(rating ?? 0).toFixed(1)}
                </p>
                <Stars value={rating ?? 0} className="mt-1.5" />
                <p className="text-muted-foreground mt-1 text-xs">
                  {total !== null
                    ? `${formatNumber(total)} ${total === 1 ? "rating" : "ratings"}`
                    : `${formatNumber(reviews.length)} loaded`}
                </p>
              </div>

              {complete ? (
                <div className="min-w-[12rem] flex-1 space-y-1">
                  {distribution.map((count, i) => {
                    const star = 5 - i;
                    return (
                      <ProgressMeter
                        key={star}
                        value={count}
                        total={Math.max(1, reviews.length)}
                        tone={count === 0 ? "neutral" : "warning"}
                        leading={`${star} star`}
                        trailing={formatNumber(count)}
                        label={`${count} of ${reviews.length} rated ${star}`}
                      />
                    );
                  })}
                </div>
              ) : null}
            </div>

            <div className="space-y-2">
              {reviews.map((review, i) => (
                <ReviewRow key={review.id} review={review} index={i} />
              ))}
            </div>

            {hasNextPage ? (
              <Button
                variant="outline"
                size="sm"
                className={cn("w-full", pressable)}
                disabled={isFetchingNextPage}
                onClick={() => void fetchNextPage()}
              >
                {isFetchingNextPage ? <Loader2Icon className="animate-spin" /> : null}
                Load {REVIEW_PAGE_SIZE} more
              </Button>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}
