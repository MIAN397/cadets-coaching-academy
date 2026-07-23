# Original User Request

## 2026-07-22T17:26:07Z

Enhance the Cadets Coaching Academy LMS to calculate and display subject-by-subject percentage scores and overall academic progress for students using visual card metrics and progress bars. Provide full progress visibility to Admin and Developer roles, and grant Developer role deletion controls for student attempt records.

Working directory: /Users/miantuahaafzal/Documents/Cadets Coaching Academy
Integrity mode: development

## Requirements

### R1. Student Subject-Wise Performance Metrics
Display subject-by-subject percentage accuracy scores (e.g., Mathematics 85%, Physics 92%) and visual progress bars on the Student Dashboard. Calculate these metrics dynamically from all attempted quiz submissions.

### R2. Admin & Developer Full Progress Monitoring
Provide Admin and Developer dashboards with comprehensive academic progress overviews for every cadet, including overall percentage, subject-by-subject performance, total quizzes attempted, and overall score averages.

### R3. Developer Attempt Record Management
Grant Developer role users the ability to delete individual student quiz attempt records from both the Developer Dashboard and cadet details views, with confirmation prompts and live recalculation of all dependent metrics.

## Acceptance Criteria

### Subject Analytics & Progress
- [ ] Student dashboard renders subject-wise percentage cards with visual progress bars for each subject area attempted.
- [ ] Cumulative overall percentage and correct answer counts update dynamically based on valid quiz submissions.

### Monitoring & Administrative Deletion
- [ ] Admin and Developer dashboards display subject-by-subject breakdown tables and progress summaries for all registered cadets.
- [ ] Developer dashboard includes a working "Delete Submission" action for student quiz attempts that removes the record from Firestore and recalculates progress metrics instantly.

### Build Verification
- [ ] Project builds cleanly via `npm run build` with zero TypeScript or compilation errors.
