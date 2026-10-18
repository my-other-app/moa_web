/*
 * The pure half of topics: schemas, the rules for deriving and filtering,
 * and the chips. The fetch and the query hook live in each app, beside the
 * `api` client its tests stub.
 */
export {
  topicSchema,
  topicInterestSchema,
  topicRefSchema,
  topicRefsField,
  topicStatsSchema,
  linkedInterestSchema,
  parseTopicTree,
  type Topic,
  type TopicInterest,
  type TopicRef,
  type TopicStats,
  type LinkedInterest,
} from "./schemas";
export {
  isTopicAware,
  topicColor,
  topicLabel,
  interestEmoji,
  interestIndex,
  toTopicRef,
  topicsForInterests,
  resolveTopics,
  searchKey,
  filterTopicTree,
} from "./derive";
export { TopicChips, TopicDot, topicTint } from "./topic-chips";
