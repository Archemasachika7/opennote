import { renderHook } from "@testing-library/react";
import * as m from "motion/react";
import { useSafeMotion, motionTokens } from "../../src/ui/motion";

vi.mock("motion/react", async (orig) => ({ ...(await orig<typeof m>()), useReducedMotion: vi.fn(() => false) }));

it("moves things normally", () => {
  const { result } = renderHook(() => useSafeMotion(motionTokens.distance.md));
  expect(result.current.initial).toEqual({ opacity: 0, y: 16 });
});

it("drops movement and uses a short fade when the user prefers reduced motion", () => {
  vi.mocked(m.useReducedMotion).mockReturnValue(true);
  const { result } = renderHook(() => useSafeMotion(motionTokens.distance.md));
  expect(result.current.initial).toEqual({ opacity: 0, y: 0 });
  expect(result.current.exit).toEqual({ opacity: 0, y: 0 });
  expect(result.current.transition).toEqual({ duration: 0.18 });
});
