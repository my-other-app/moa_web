"use client";

import * as React from "react";
import { Loader2Icon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { SectionTitle } from "@moa/app-kit";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  buttonVariants,
  cn,
} from "@moa/ui";
import { hoverLift, pressable, stagger } from "@moa/ui/motion";

import {
  useCreateInterest,
  useCreateInterestCategory,
  useDeleteInterest,
  useInterestCategories,
  useUpdateInterest,
} from "../queries";
import type { Interest, InterestCategory } from "../schemas";
import { useCan } from "@/hooks/use-can";

/**
 * Interests and their categories.
 *
 * Both were create-only through the API and had no UI at all, so a typo was
 * permanent and an obsolete entry could not be removed -- reference data
 * shown on every club, event and user profile that the product had no way to
 * correct.
 */
function InterestDialogBody({
  categories,
  existing,
  defaultCategoryId,
  onOpenChange,
}: {
  categories: InterestCategory[];
  existing?: Interest;
  defaultCategoryId?: number;
  onOpenChange: (open: boolean) => void;
}) {
  const create = useCreateInterest();
  const update = useUpdateInterest();
  const mutation = existing ? update : create;

  /*
   * Initialised once per opening rather than synced from an effect: the
   * dialog body is remounted via a key below, so useState initialisers run
   * fresh each time. An effect would also paint one frame with the previous
   * interest's values before correcting itself.
   */
  const [name, setName] = React.useState(existing?.name ?? "");
  const [icon, setIcon] = React.useState(
    existing?.icon && /[^\u0000-\u007F]/.test(existing.icon) ? existing.icon : ""
  );
  const [categoryId, setCategoryId] = React.useState<number | undefined>(
    defaultCategoryId ?? categories[0]?.id
  );

  const canSave = name.trim().length >= 2 && categoryId !== undefined;

  async function save() {
    if (!canSave) return;
    const input = { name: name.trim(), category_id: categoryId!, icon };
    if (existing) await update.mutateAsync({ id: existing.id, input });
    else await create.mutateAsync(input);
    onOpenChange(false);
  }

  return (
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{existing ? `Edit ${existing.name}` : "New interest"}</DialogTitle>
          <DialogDescription>
            Interests appear on club, event and user profiles. Renaming one
            updates it everywhere.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-[1fr_5rem]">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="interest-name">Name</Label>
            <Input
              id="interest-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={50}
              disabled={mutation.isPending}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="interest-icon">Emoji</Label>
            <Input
              id="interest-icon"
              value={icon}
              onChange={(e) => setIcon(e.target.value)}
              maxLength={10}
              placeholder="⌨️"
              disabled={mutation.isPending}
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="interest-category">Category</Label>
          <Select
            value={categoryId ? String(categoryId) : undefined}
            onValueChange={(next) => setCategoryId(Number(next))}
            disabled={mutation.isPending}
          >
            <SelectTrigger id="interest-category" className="w-full">
              <SelectValue placeholder="Choose a category" />
            </SelectTrigger>
            <SelectContent>
              {categories.map((category) => (
                <SelectItem key={category.id} value={String(category.id)}>
                  {category.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={mutation.isPending}
          >
            Cancel
          </Button>
          <Button disabled={!canSave || mutation.isPending} onClick={save}>
            {mutation.isPending ? <Loader2Icon className="animate-spin" /> : null}
            {existing ? "Save changes" : "Add interest"}
          </Button>
        </DialogFooter>
      </DialogContent>
  );
}

/**
 * The wrapper owns open/close; the body owns the form. Keying the body on
 * which interest is being edited remounts it, so its state initialises from
 * the right record without an effect to copy values in.
 */
function InterestDialog(props: {
  categories: InterestCategory[];
  existing?: Interest;
  defaultCategoryId?: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      {props.open ? (
        <InterestDialogBody
          key={`${props.existing?.id ?? "new"}-${props.defaultCategoryId ?? ""}`}
          {...props}
        />
      ) : null}
    </Dialog>
  );
}

function CategoryDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const create = useCreateInterestCategory();
  const [name, setName] = React.useState("");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>New category</DialogTitle>
          <DialogDescription>
            Categories group interests in the picker clubs and users see.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="category-name">Name</Label>
          <Input
            id="category-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={create.isPending}
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={name.trim().length < 2 || create.isPending}
            onClick={async () => {
              await create.mutateAsync(name.trim());
              setName("");
              onOpenChange(false);
            }}
          >
            {create.isPending ? <Loader2Icon className="animate-spin" /> : null}
            Add category
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function InterestChip({
  interest,
  onEdit,
}: {
  interest: Interest;
  onEdit: () => void;
}) {
  const remove = useDeleteInterest();
  const [confirm, setConfirm] = React.useState(false);
  // Renaming reshapes every profile that uses it; removing it detaches them.
  const canEdit = useCan("manage_content");
  const canDelete = useCan("destroy");

  // Seeded rows store the literal word "string"; only a real emoji is shown.
  const emoji =
    interest.icon && /[^\u0000-\u007F]/.test(interest.icon) ? interest.icon : null;

  return (
    <>
      <div
        className={cn(
          "flex items-center gap-2 rounded-full border py-1 pr-1 pl-3 text-sm",
          hoverLift
        )}
      >
        {emoji ? <span aria-hidden="true">{emoji}</span> : null}
        <span>{interest.name}</span>
        {canEdit ? (
          <button
            type="button"
            onClick={onEdit}
            aria-label={`Edit ${interest.name}`}
            className="text-muted-foreground hover:text-foreground"
          >
            <PencilIcon className="size-3.5" />
          </button>
        ) : null}
        {canDelete ? (
          <button
            type="button"
            onClick={() => setConfirm(true)}
            aria-label={`Delete ${interest.name}`}
            className="text-muted-foreground hover:text-destructive"
          >
            <Trash2Icon className="size-3.5" />
          </button>
        ) : null}
      </div>

      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{interest.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              It is removed from every club, event and user that selected it.
              They keep their other interests. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={cn(buttonVariants({ variant: "destructive" }))}
              disabled={remove.isPending}
              onClick={(event) => {
                event.preventDefault();
                void remove.mutateAsync(interest.id).then(() => setConfirm(false));
              }}
            >
              Delete interest
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export function InterestsManager() {
  const { data: categories, isPending, isError } = useInterestCategories();
  const canEdit = useCan("manage_content");
  const [editing, setEditing] = React.useState<Interest | undefined>();
  const [addTo, setAddTo] = React.useState<number | undefined>();
  const [interestOpen, setInterestOpen] = React.useState(false);
  const [categoryOpen, setCategoryOpen] = React.useState(false);

  if (isPending) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-28 w-full" />
        ))}
      </div>
    );
  }

  if (isError || !categories) {
    return (
      <EmptyState
        tone="muted"
        title="Could not load interests"
        description="Try reloading the page."
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className={cn("flex flex-wrap gap-2", !canEdit && "hidden")}>
        <Button
          size="sm"
          className={pressable}
          disabled={categories.length === 0}
          onClick={() => {
            setEditing(undefined);
            setAddTo(categories[0]?.id);
            setInterestOpen(true);
          }}
        >
          <PlusIcon /> New interest
        </Button>
        <Button
          size="sm"
          variant="outline"
          className={pressable}
          onClick={() => setCategoryOpen(true)}
        >
          <PlusIcon /> New category
        </Button>
      </div>

      {categories.length === 0 ? (
        <EmptyState
          tone="muted"
          title="No categories yet"
          description="Add a category first — interests live inside one."
        />
      ) : (
        categories.map((category, index) => (
          <Card key={category.id} style={stagger(index)}>
            <CardContent className="space-y-3">
              <SectionTitle
                action={
                  <Button
                    size="xs"
                    variant="ghost"
                    onClick={() => {
                      setEditing(undefined);
                      setAddTo(category.id);
                      setInterestOpen(true);
                    }}
                  >
                    <PlusIcon /> Add
                  </Button>
                }
              >
                {category.name}
              </SectionTitle>

              {category.interests.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  Nothing in this category yet.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {category.interests.map((interest) => (
                    <InterestChip
                      key={interest.id}
                      interest={interest}
                      onEdit={() => {
                        setEditing(interest);
                        setAddTo(category.id);
                        setInterestOpen(true);
                      }}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ))
      )}

      <InterestDialog
        categories={categories}
        existing={editing}
        defaultCategoryId={addTo}
        open={interestOpen}
        onOpenChange={setInterestOpen}
      />
      <CategoryDialog open={categoryOpen} onOpenChange={setCategoryOpen} />
    </div>
  );
}
