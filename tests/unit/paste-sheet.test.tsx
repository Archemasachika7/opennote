import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PasteSheet } from "../../src/live/PasteSheet";

vi.mock("../../src/live/vendor", () => ({ loadVendor: async () => ({ react: "", reactDom: "", babel: "" }) }));

const REACT_SRC = "import { LineChart } from 'recharts';\nexport default function SalesChart() { return <div>x</div>; }";

it("detects react, turns network on for third-party imports, and saves", async () => {
  const user = userEvent.setup();
  const onSave = vi.fn();
  render(<PasteSheet open onClose={() => {}} onSave={onSave} />);
  fireEvent.change(screen.getByRole("textbox", { name: /artifact code/i }), { target: { value: REACT_SRC } });
  expect(await screen.findByText(/Needs internet for: recharts/)).toBeInTheDocument();
  expect(screen.getByRole("checkbox", { name: /allow internet/i })).toBeChecked();
  expect(screen.getByRole("textbox", { name: /title/i })).toHaveValue("Sales Chart");
  await user.click(screen.getByRole("button", { name: "Save" }));
  expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ artifactType: "react", allowNetwork: true, title: "Sales Chart", source: REACT_SRC }));
});

it("rejects sources over 5 MB", async () => {
  render(<PasteSheet open onClose={() => {}} onSave={() => {}} />);
  fireEvent.change(screen.getByRole("textbox", { name: /artifact code/i }), { target: { value: "<p>" + "x".repeat(6 * 1024 * 1024) } });
  expect(await screen.findByText("Too large (max 5 MB)")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
});

it("save is disabled when empty and the type can be overridden", async () => {
  const user = userEvent.setup();
  const onSave = vi.fn();
  render(<PasteSheet open onClose={() => {}} onSave={onSave} />);
  expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  fireEvent.change(screen.getByRole("textbox", { name: /artifact code/i }), { target: { value: "<h1>Hi</h1>" } });
  await user.selectOptions(screen.getByRole("combobox", { name: /type/i }), "html");
  await user.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ artifactType: "html", allowNetwork: false, title: "Hi" })));
});
