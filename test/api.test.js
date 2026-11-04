const test = require('node:test');
const assert = require('node:assert');

// Run the handler without Atlas: stub the connection and the model's database calls.
const dbPath = require.resolve('../db');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: async () => {} };
process.env.WRITE_KEY = 'secret';

const handler = require('../api/index.js');
const Attendance = require('mongoose').models.Attendance;

async function call(req) {
  const out = {};
  const res = {
    setHeader() {},
    status(code) { out.status = code; return res; },
    json(body) { out.body = body; return res; },
    end() { return res; },
  };
  await handler({ method: 'GET', headers: {}, query: {}, ...req }, res);
  return out;
}

const keyed = { 'x-api-key': 'secret' };
const student = { studentName: ' Ana Cruz ', section: 'BSIT-3A', subjectName: 'Database 2' };

test('uses the daily_attendance collection', () => {
  assert.strictEqual(Attendance.collection.name, 'daily_attendance');
});

test('GET lists records without a key', async () => {
  Attendance.find = () => ({ sort: () => ({ lean: async () => [{ studentName: 'A' }] }) });
  const r = await call({});
  assert.deepStrictEqual([r.status, r.body], [200, [{ studentName: 'A' }]]);
});

test('writes need the key, and are off when WRITE_KEY is unset', async () => {
  assert.strictEqual((await call({ method: 'POST', body: student })).status, 401);
  delete process.env.WRITE_KEY;
  assert.strictEqual((await call({ method: 'POST', body: student, headers: keyed })).status, 503);
  process.env.WRITE_KEY = 'secret';
});

test('POST validates, trims, rejects duplicates and ignores extra fields', async () => {
  Attendance.exists = async () => null;
  Attendance.prototype.save = async function () { return this; };

  assert.strictEqual((await call({ method: 'POST', headers: keyed, body: { section: 'X' } })).status, 400);

  const ok = await call({ method: 'POST', headers: keyed, body: { ...student, isAdmin: true } });
  assert.strictEqual(ok.status, 201);
  assert.strictEqual(ok.body.studentName, 'Ana Cruz');
  assert.deepStrictEqual(ok.body.attendanceDates, []);
  assert.strictEqual(ok.body.isAdmin, undefined);

  Attendance.exists = async () => ({ _id: 1 });
  assert.strictEqual((await call({ method: 'POST', headers: keyed, body: student })).status, 409);
});

test('PATCH marks a valid day as UTC midnight and rejects bad input', async () => {
  const id = '6ac6e8007b78d74f804ee6c0';
  let update;
  Attendance.findByIdAndUpdate = (_id, u) => { update = u; return { lean: async () => ({ _id: id }) }; };

  const ok = await call({ method: 'PATCH', headers: keyed, query: { id }, body: { date: '2026-10-08' } });
  assert.strictEqual(ok.status, 200);
  assert.strictEqual(update.$addToSet.attendanceDates.toISOString(), '2026-10-08T00:00:00.000Z');

  for (const [q, date] of [[{ id }, '2026-02-30'], [{ id }, 'today'], [{ id: 'nope' }, '2026-10-08']]) {
    assert.strictEqual((await call({ method: 'PATCH', headers: keyed, query: q, body: { date } })).status, 400);
  }
});

test('other methods are refused', async () => {
  assert.strictEqual((await call({ method: 'DELETE', headers: keyed })).status, 405);
});
