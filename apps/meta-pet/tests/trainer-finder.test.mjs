import test from 'node:test';
import assert from 'node:assert/strict';
import { trainerArea, trainerGoals, trainerSearchLinks, parseFacebookLocations } from '../src/trainerFinder.ts';

test('trainer links use fixed hosts and only selected area and controlled goal words', () => {
  for (const goal of trainerGoals) {
    const result = trainerSearchLinks('Cape Town & nearby', goal.id);
    assert.ok(result);
    const maps = new URL(result.maps);
    const facebook = new URL(result.facebook);
    assert.equal(maps.origin, 'https://www.google.com');
    assert.equal(maps.pathname, '/maps/search/');
    assert.deepEqual([...maps.searchParams.keys()], ['api', 'query']);
    assert.equal(maps.searchParams.get('api'), '1');
    assert.equal(maps.searchParams.get('query'), goal.search + ' Cape Town & nearby');
    assert.equal(facebook.origin, 'https://www.facebook.com');
    assert.equal(facebook.pathname, '/search/pages/');
    assert.deepEqual([...facebook.searchParams.keys()], ['q']);
    assert.equal(facebook.searchParams.get('q'), result.query);
  }
  assert.equal(trainerSearchLinks('Cape Town', 'PRIVATE_PET_NAME'), null);
});

test('areas are bounded and control characters or non-area objects do not enter searches', () => {
  assert.equal(trainerArea('  Cape   Town  '), 'Cape Town');
  for (const input of ['', 'x'.repeat(101), 'Cape Town\nPRIVATE_NOTE', { name: 'PRIVATE_PET', careNeeds: 'PRIVATE_NOTE' }, null]) {
    assert.equal(trainerArea(input), '');
    assert.equal(trainerSearchLinks(input, 'puppy'), null);
  }
  const search = trainerSearchLinks('Cape Town&redirect=https://other.invalid', 'walks');
  assert.equal(new URL(search.facebook).searchParams.size, 1);
  assert.equal(new URL(search.maps).origin, 'https://www.google.com');
});

test('Facebook choices only contain bounded fields from the explicitly selected source', () => {
  const result = parseFacebookLocations({ status: 'available', locations: [
    { id: 'city-1', source: 'facebook_profile', label: 'Profile city', area: 'Cape Town', secret: 'PRIVATE_TOKEN', street: 'PRIVATE_STREET' },
    { id: 'city-1', source: 'facebook_profile', label: 'Duplicate', area: 'Duplicate city' },
    { id: 'page-1', source: 'facebook_page', label: 'Private Page', area: 'Johannesburg' },
    { id: 'city-2', source: 'facebook_profile', label: 'Too much', area: 'x'.repeat(101) },
  ] }, 'profile');
  assert.deepEqual(result, { status: 'available', locations: [{ id: 'city-1', source: 'facebook_profile', label: 'Profile city', area: 'Cape Town' }] });
  const links = trainerSearchLinks(result.locations[0].area, 'confidence');
  assert.doesNotMatch(JSON.stringify(links), /PRIVATE|city-1|Profile|street|token/i);
});

test('permission-required and malformed responses cannot display location payloads', () => {
  assert.deepEqual(parseFacebookLocations({ status: 'permission_required', locations: [{ area: 'PRIVATE_CITY' }] }, 'pages'), { status: 'permission_required', locations: [] });
  assert.deepEqual(parseFacebookLocations({ status: 'available', locations: [{ id: 'bad', source: 'facebook_profile', area: 'PRIVATE_CITY', label: 'Wrong source' }] }, 'pages'), { status: 'no_location', locations: [] });
  assert.deepEqual(parseFacebookLocations({ status: 'available' }, 'profile'), { status: 'unavailable', locations: [] });
  assert.deepEqual(parseFacebookLocations({ status: 'surprise', locations: [] }, 'profile'), { status: 'unavailable', locations: [] });
});
