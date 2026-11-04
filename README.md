# Bisquera API backend

Vercel serverless API for the lab attendance system. It reads and writes
`LabAttendanceDB_Bisquera.daily_attendance` on MongoDB Atlas. The database name is set in
`db.js`, so it does not depend on what the connection string contains.

## Environment variables

Set these in Vercel: Project, Settings, Environment Variables. Redeploy afterwards.

| Name | Value |
| --- | --- |
| `MONGODB_URI` | Atlas connection string (`mongodb+srv://...`) for a database user that can read and write `LabAttendanceDB_Bisquera` |
| `WRITE_KEY` | A password of your choice. The teacher types it into the frontend to add students and mark attendance. If it is not set, the API is read-only. |

## Endpoints (`/api`)

| Method | What it does | Needs `x-api-key`? |
| --- | --- | --- |
| `GET` | All attendance records | No |
| `POST` | Add a student: `{ "studentName", "section", "subjectName" }` | Yes |
| `PATCH ?id=<_id>` | Mark present: `{ "date": "YYYY-MM-DD" }` | Yes |

Run the tests with `npm test` (no database needed).
