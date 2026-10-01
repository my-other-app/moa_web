"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRightIcon, EyeIcon, EyeOffIcon, Loader2Icon } from "lucide-react";
import { ApiError } from "@moa/api";
import {
  Button,
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
  cn,
} from "@moa/ui";
import { pressable } from "@moa/ui/motion";

import { useLogin } from "../queries";
import { loginSchema, type LoginInput } from "../schemas";

export function LoginForm({
  usernamePlaceholder = "your_username",
  redirectTo = "/",
}: {
  usernamePlaceholder?: string;
  /** Where to land after sign-in when no ?next= was supplied. */
  redirectTo?: string;
} = {}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const login = useLogin();
  const [showPassword, setShowPassword] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);

  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: "", password: "" },
  });

  async function onSubmit(values: LoginInput) {
    setFormError(null);
    try {
      await login.mutateAsync(values);
      // `next` is validated below before use: an open redirect here would let
      // a crafted link bounce an admin to an attacker's page after a genuine
      // sign-in.
      const next = searchParams.get("next");
      const safeNext =
        next && next.startsWith("/") && !next.startsWith("//") ? next : redirectTo;
      router.replace(safeNext);
      router.refresh();
    } catch (error) {
      setFormError(
        error instanceof ApiError
          ? error.message
          : "Could not sign in. Please try again."
      );
    }
  }

  const isSubmitting = form.formState.isSubmitting || login.isPending;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5" noValidate>
        <FormField
          control={form.control}
          name="username"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Username</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  autoComplete="username"
                  autoFocus
                  placeholder={usernamePlaceholder}
                  disabled={isSubmitting}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Password</FormLabel>
              <FormControl>
                <div className="relative">
                  <Input
                    {...field}
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    placeholder="••••••••••"
                    disabled={isSubmitting}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className={cn(
                      "text-muted-foreground hover:text-foreground absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-md transition-colors",
                      "focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:outline-none"
                    )}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    tabIndex={-1}
                  >
                    {showPassword ? (
                      <EyeOffIcon className="size-4" />
                    ) : (
                      <EyeIcon className="size-4" />
                    )}
                  </button>
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {formError ? (
          <p
            role="alert"
            className="bg-destructive/10 text-destructive animate-in fade-in-0 slide-in-from-top-1 rounded-md px-3 py-2 text-sm motion-reduce:animate-none"
          >
            {formError}
          </p>
        ) : null}

        <Button
          type="submit"
          className={cn("group w-full", pressable)}
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <>
              <Loader2Icon className="animate-spin" />
              Signing in…
            </>
          ) : (
            <>
              Sign in
              <ArrowRightIcon className="transition-transform duration-200 group-hover:translate-x-0.5" />
            </>
          )}
        </Button>
      </form>
    </Form>
  );
}
