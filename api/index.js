const mongoose = require('mongoose');
const connectToDatabase = require('../db');

const schema = new mongoose.Schema(
  {
    studentName: { type: String, required: true, trim: true, maxlength: 100 },
    section: { type: String, required: true, trim: true, maxlength: 50 },
    subjectName: { type: String, required: true, trim: true, maxlength: 100 },
    attendanceDates: [Date],
  },
  { versionKey: false } // the existing documents have no __v
);

// The 3rd argument pins the collection; without it Mongoose would use "attendances".
const Attendance =
  mongoose.models.Attendance || mongoose.model('Attendance', schema, 'daily_attendance');

// Dates are stored as UTC midnight, like the existing documents. Rejects "2026-02-30".
function toDay(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s ? null : d;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!['GET', 'POST', 'PATCH'].includes(req.method)) {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  if (req.method !== 'GET') {
    // shortcut: one shared key and no rate limit; move to real logins if more than one teacher uses this.
    if (!process.env.WRITE_KEY) {
      return res.status(503).json({ error: 'Writes are off: set WRITE_KEY on the server' });
    }
    if (req.headers['x-api-key'] !== process.env.WRITE_KEY) {
      return res.status(401).json({ error: 'Wrong or missing teacher key' });
    }
  }

  try {
    await connectToDatabase();

    if (req.method === 'GET') {
      // shortcut: no pagination, fine for a class roster; add limit/skip past a few thousand rows.
      const rows = await Attendance.find().sort({ section: 1, studentName: 1 }).lean();
      return res.status(200).json(rows);
    }

    if (req.method === 'POST') {
      const { studentName, section, subjectName } = req.body || {};
      const doc = new Attendance({ studentName, section, subjectName });
      await doc.validate();
      const { studentName: n, section: s, subjectName: j } = doc;
      if (await Attendance.exists({ studentName: n, section: s, subjectName: j })) {
        return res.status(409).json({ error: 'That student is already listed for this section and subject' });
      }
      await doc.save();
      return res.status(201).json(doc);
    }

    // PATCH /api?id=<_id> with { "date": "YYYY-MM-DD" } marks the student present that day.
    const day = toDay(req.body && req.body.date);
    if (!day || !mongoose.isObjectIdOrHexString(req.query.id)) {
      return res.status(400).json({ error: 'Need ?id=<student id> and a date like 2026-10-08' });
    }
    const updated = await Attendance.findByIdAndUpdate(
      req.query.id,
      { $addToSet: { attendanceDates: day } },
      { new: true }
    ).lean();
    return updated
      ? res.status(200).json(updated)
      : res.status(404).json({ error: 'Student not found' });
  } catch (err) {
    if (err.name === 'ValidationError') return res.status(400).json({ error: err.message });
    console.error(err);
    return res.status(500).json({ error: 'Database error' });
  }
};
