export {
  useInterestCategories,
  useCreateInterest,
  useUpdateInterest,
  useDeleteInterest,
  useCreateInterestCategory,
} from "./queries";
export { InterestsManager } from "./components/interests-manager";
export {
  interestCategorySchema,
  interestFormSchema,
  type Interest,
  type InterestCategory,
} from "./schemas";
