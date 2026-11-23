import { vi } from "vitest";

/**
 * Tests run on a fixed date with no event bonus running (the "default" event setting follows the calendar),
 * so results don't change from week to week. The clock still ticks. Tests about events set their own date.
 */
vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-11-05T12:00:00"), shouldAdvanceTime: true });
