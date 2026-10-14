const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadMath() {
  const context = vm.createContext({});
  const source = fs.readFileSync(path.join(__dirname, '../src/zone-math.js'), 'utf8');
  vm.runInContext(source, context);
  return vm.runInContext('globalThis[Symbol.for("chromeTZ.zoneMath")]', context);
}

test('spring gap advances a missing New York local time', () => {
  const { resolveLocal, getWallParts } = loadMath();
  const epoch = resolveLocal({ year: 2024, month: 3, day: 10, hour: 2, minute: 30, second: 0, millisecond: 0 }, 'America/New_York');
  assert.equal(epoch, Date.parse('2024-03-10T07:30:00.000Z'));
  const parts = getWallParts(epoch, 'America/New_York');
  assert.equal(parts.hour, 3);
  assert.equal(parts.minute, 30);
  assert.equal(parts.offsetMinutes, 240);
});

test('autumn overlap chooses the earlier New York instant', () => {
  const { resolveLocal, getWallParts } = loadMath();
  const epoch = resolveLocal({ year: 2024, month: 11, day: 3, hour: 1, minute: 30, second: 0, millisecond: 0 }, 'America/New_York');
  assert.equal(epoch, Date.parse('2024-11-03T05:30:00.000Z'));
  assert.equal(getWallParts(epoch, 'America/New_York').offsetMinutes, 240);
});

test('Kolkata has a negative Date-style offset', () => {
  const { resolveLocal, getWallParts } = loadMath();
  const epoch = resolveLocal({ year: 2024, month: 1, day: 1, hour: 0, minute: 0, second: 0, millisecond: 0 }, 'Asia/Kolkata');
  assert.equal(epoch, Date.parse('2023-12-31T18:30:00.000Z'));
  const parts = getWallParts(epoch, 'Asia/Kolkata');
  assert.equal(parts.year, 2024);
  assert.equal(parts.month, 1);
  assert.equal(parts.day, 1);
  assert.equal(parts.hour, 0);
  assert.equal(parts.offsetMinutes, -330);
});

test('BCE wall years use astronomical numbering', () => {
  const { getWallParts } = loadMath();
  const yearZero = getWallParts(Date.parse('0000-01-15T12:00:00.000Z'), 'UTC');
  assert.equal(yearZero.year, 0);
  assert.equal(yearZero.offsetMinutes, 0);
  const caesar = getWallParts(Date.parse('-000044-01-15T12:00:00.000Z'), 'UTC');
  assert.equal(caesar.year, -44);
});

test('local dates near TimeClip maximum skip invalid offset probes', () => {
  const { resolveLocal } = loadMath();
  const epoch = resolveLocal({ year: 275760, month: 9, day: 12, hour: 0,
    minute: 0, second: 0, millisecond: 0 }, 'America/New_York');
  assert.equal(epoch, 8639999928000000);
});

test('valid boundary instants retain a wall offset across the local date boundary', () => {
  const { getWallParts } = loadMath();
  const wall = getWallParts(8640000000000000, 'Asia/Kolkata');
  assert.equal(wall.year, 275760);
  assert.equal(wall.month, 9);
  assert.equal(wall.day, 13);
  assert.equal(wall.hour, 5);
  assert.equal(wall.minute, 30);
  assert.equal(wall.offsetMinutes, -330);
});
