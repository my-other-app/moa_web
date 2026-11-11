import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { useForm, type UseFormReturn } from "react-hook-form";
import { ApiError } from "@moa/api";
import { Form } from "@moa/ui";

/**
 * "Add a speaker" with the speakers directory: the club's past speakers
 * first; picking one fills the row (still editable, this event's own copy)
 * and the save carries the profile and the talk title. On an API from
 * before the directory it adds a blank row, as it always did.
 */
const server = vi.hoisted(() => ({ directory: true }));

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    api: {
      get: vi.fn(async (path: string) => {
        if (path === "/api/v1/clubs/speakers") {
          if (!server.directory) throw new ApiError({ status: 404, message: "Not Found", routeMissing: true });
          return [
            {
              id: 7,
              profile_id: 7,
              name: "Ananya Iyer",
              headline: "Head of Research · IIT-M",
              photo: { thumbnail: "https://cdn.example/a-t.jpg", medium: "https://cdn.example/a-m.jpg" },
              bio: "Leads the robotics lab.",
              links: { website: "https://ananya.example", linkedin: "https://linkedin.com/in/ananya" },
              city: "Chennai",
              topics: [],
              status: "active",
              claimed: false,
              talks_count: 2,
              last_talk: { event_id: 77, event_name: "DevFest 2026", date: "2026-10-04T10:00:00Z" },
              own: true,
            },
          ];
        }
        throw new ApiError({ status: 404, message: "Not Found", routeMissing: true });
      }),
      post: vi.fn(),
      put: vi.fn(),
      patch: vi.fn(),
      del: vi.fn(),
    },
  };
});

const { render } = await import("@/test/render");
const { PeopleStep } = await import("./components/steps/people-step");
const { emptyEventForm } = await import("./components/event-form");
const { toEventFormData } = await import("./api");
const { eventFormSchema } = await import("./schemas");
type Values = import("./schemas").EventFormValues;

let form: UseFormReturn<Values>;

function Harness({ defaults }: { defaults: Values }) {
  const f = useForm<Values>({ defaultValues: defaults });
  React.useEffect(() => {
    form = f;
  }, [f]);
  return (
    <Form {...f}>
      <form>
        <PeopleStep />
      </form>
    </Form>
  );
}

const required = { name: "Hack Night", category_id: 1, event_datetime: "2026-11-01T18:00", duration: 3, location_name: "Technopark Phase 1" };

beforeEach(() => {
  server.directory = true;
});

describe("adding a speaker", () => {
  it("picks a past speaker: the row is filled in, and the save carries the profile and the talk title", async () => {
    render(<Harness defaults={{ ...emptyEventForm }} />);
    fireEvent.click(screen.getByRole("button", { name: /Add a speaker/ }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: "Pick Ananya Iyer" }));
    expect(await screen.findByDisplayValue("Ananya Iyer")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Head of Research · IIT-M")).toBeInTheDocument();
    expect(screen.getByDisplayValue("https://linkedin.com/in/ananya")).toBeInTheDocument();
    expect(screen.getByText(/From your past speakers/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Talk title · optional"), { target: { value: "Rovers on a budget" } });
    const fd = toEventFormData(eventFormSchema.parse({ ...form.getValues(), ...required }));
    const [sent] = JSON.parse(String(fd.get("speakers")));
    expect(sent).toMatchObject({ name: "Ananya Iyer", designation: "Head of Research · IIT-M", link: "https://linkedin.com/in/ananya", speaker_profile_id: 7, talk_title: "Rovers on a budget" });
    // The profile's photo is the server's to fill in: an empty photo is not sent as a URL.
    expect(sent).not.toHaveProperty("photo_url");
  });

  it("adds someone new as a blank row with the name typed", async () => {
    render(<Harness defaults={{ ...emptyEventForm }} />);
    fireEvent.click(screen.getByRole("button", { name: /Add a speaker/ }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Find a speaker"), { target: { value: "Meera K" } });
    fireEvent.click(screen.getByRole("button", { name: /Add “Meera K” as someone new/ }));
    expect(await screen.findByDisplayValue("Meera K")).toBeInTheDocument();
    expect(form.getValues("speakers")?.[0]?.speaker_profile_id).toBeUndefined();
  });

  it("adds a blank row, as before, on an API without the speakers directory", async () => {
    server.directory = false;
    render(<Harness defaults={{ ...emptyEventForm }} />);
    // Once the API has answered that it has no directory.
    await new Promise((r) => setTimeout(r, 50));
    fireEvent.click(screen.getByRole("button", { name: /Add a speaker/ }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(form.getValues("speakers")).toHaveLength(1);
    expect(screen.queryByLabelText("Talk title · optional")).toBeNull();
  });
});
