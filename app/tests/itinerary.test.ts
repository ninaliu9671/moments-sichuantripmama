import assert from 'node:assert/strict';
import test from 'node:test';
import { getItineraryDetails, itineraryDays, resolveTripDay } from '../lib/itinerary';

const days = itineraryDays.map((item) => ({
  day: item.day,
  date: `2026-09-${String(20 + item.day).padStart(2, '0')}`,
  title: item.route,
  placeIds: item.routePlaceIds,
}));

test('resolveTripDay clamps dates before and after the trip', () => {
  assert.equal(resolveTripDay(days, '2026-09-01'), 1);
  assert.equal(resolveTripDay(days, '2026-09-21'), 1);
  assert.equal(resolveTripDay(days, '2026-09-25'), 5);
  assert.equal(resolveTripDay(days, '2026-10-01'), 8);
});

test('every itinerary day includes the information required by the daily view', () => {
  assert.equal(itineraryDays.length, 8);
  for (const day of itineraryDays) {
    assert.ok(day.route);
    assert.ok(day.meeting);
    assert.ok(day.meals);
    assert.ok(day.accommodation);
    assert.ok(day.schedule.length);
    assert.ok(day.attractions.length);
    assert.ok(day.cautions.length);
    assert.equal(getItineraryDetails(day.day), day);
  }
});
