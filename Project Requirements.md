# Developer Assessment & Coding Platform

## 1. Project Overview

**Developer Assessment & Coding Platform** is an online assessment and recruitment platform designed to help companies evaluate developer candidates through coding challenges, MCQ questions, and written questions.

The platform allows companies to create assessments, manage problem banks, invite candidates, conduct timed assessments, evaluate submissions, and generate detailed candidate reports.

### Category

**Education / Recruitment**

### Primary Goal

To provide a secure, scalable, and centralized platform for technical candidate assessment and recruitment.

---

# 2. Problem Statement

Traditional technical assessments are often managed using multiple disconnected tools such as Google Forms, email, coding platforms, spreadsheets, and manual evaluation systems.

This platform aims to solve these problems by providing:

* Centralized assessment management
* Reusable problem bank
* Coding and non-coding questions
* Candidate invitation system
* Timed assessment
* Automatic evaluation
* Manual evaluation
* Candidate ranking
* Anti-cheating monitoring
* Company analytics and reports

---

# 3. Target Users

The system will support the following users:

### 3.1 Candidate

Candidates can:

* Create and manage their profile
* Upload resume
* View assessment invitations
* Accept assessment invitations
* Start assessments
* Answer MCQ questions
* Answer written questions
* Solve coding problems
* Submit assessments
* View results
* View evaluation feedback

### 3.2 Company

Companies can:

* Create company profiles
* Manage company members
* Create assessments
* Manage problem bank
* Invite candidates
* Monitor assessment progress
* View candidate results
* View analytics and reports

### 3.3 Assessment Creator

Assessment creators can:

* Create assessments
* Add problems
* Remove problems
* Reorder questions
* Set marks
* Configure assessment duration
* Configure assessment rules
* Publish assessments

### 3.4 Evaluator

Evaluators can:

* View assigned submissions
* Evaluate written answers
* Review coding submissions
* Give marks
* Add feedback
* Update evaluation status

### 3.5 Admin

Admin can:

* Manage users
* Manage companies
* Manage platform problems
* Manage assessments
* Monitor platform activity
* Manage reported content
* View system-wide analytics

---

# 4. Core Features

## 4.1 Authentication & Authorization

The system must provide secure authentication.

### Features

* User registration
* User login
* JWT authentication
* Access token
* Refresh token
* Logout
* Password hashing
* Password reset
* Email verification
* Role-based authorization

### Roles

```text
ADMIN
CANDIDATE
```

Company-specific roles:

```text
OWNER
ADMIN
ASSESSMENT_CREATOR
EVALUATOR
```

---

# 5. Candidate Management

Candidates should have a dedicated profile.

### Candidate Profile

```text
Name
Email
Phone
Bio
Location
Profile Image
Resume
GitHub
LinkedIn
```

### Candidate Features

* Update profile
* Upload resume
* View invitations
* Accept invitations
* Start assessment
* Continue assessment
* Submit assessment
* View result
* View assessment history

---

# 6. Company Management

Companies can create and manage their organization profile.

### Company Information

```text
Company Name
Company Logo
Description
Website
Slug
```

### Company Member Management

Company owners/admins can:

* Add members
* Remove members
* Change member roles
* View company members

### Company Roles

```text
OWNER
ADMIN
ASSESSMENT_CREATOR
EVALUATOR
```

---

# 7. Problem Bank

The platform must provide a reusable problem bank.

Problems can be categorized by:

### Question Type

```text
MCQ
WRITTEN
CODING
```

### Difficulty

```text
EASY
MEDIUM
HARD
```

### Problem Information

```text
Title
Description
Type
Difficulty
Marks
Tags
Created By
Created At
Updated At
```

The same problem should be reusable in multiple assessments.

---

# 8. MCQ Questions

The platform must support multiple-choice questions.

### MCQ Features

* Question title
* Question description
* Multiple options
* Correct answer
* Explanation
* Automatic evaluation

Example:

```text
Question:
What is the output of 2 + 2?

A. 3
B. 4
C. 5
D. 6
```

---

# 9. Written Questions

The platform must support written/theoretical questions.

### Features

* Question description
* Optional word limit
* Candidate text answer
* Manual evaluation
* Evaluator feedback
* Marks

Example:

```text
Explain the difference between SQL and NoSQL databases.
```

---

# 10. Coding Questions

The platform must support programming problems.

### Coding Problem Features

* Problem description
* Input format
* Output format
* Constraints
* Starter code
* Supported languages
* Time limit
* Memory limit
* Public test cases
* Hidden test cases

### Supported Languages

Initial supported languages may include:

```text
JavaScript
TypeScript
Python
C++
Java
```

The final list depends on the selected code execution infrastructure.

---

# 11. Code Execution

Candidate code must be executed in an isolated environment.

### Execution Flow

```text
Candidate
    ↓
Submit Code
    ↓
API Server
    ↓
Job Queue
    ↓
Execution Worker
    ↓
Isolated Sandbox
    ↓
Run Test Cases
    ↓
Execution Result
```

The application server must **not directly execute untrusted candidate code**.

### Execution Result

The system should track:

```text
Passed Tests
Failed Tests
Execution Time
Memory Usage
Compilation Error
Runtime Error
Time Limit Exceeded
Memory Limit Exceeded
```

---

# 12. Assessment Management

Companies can create technical assessments.

### Assessment Information

```text
Title
Description
Duration
Total Marks
Start Date
End Date
Status
Creator
Company
```

### Assessment Status

```text
DRAFT
PUBLISHED
ACTIVE
COMPLETED
ARCHIVED
```

### Assessment Lifecycle

```text
Create
  ↓
Add Problems
  ↓
Configure Settings
  ↓
Publish
  ↓
Invite Candidates
  ↓
Candidate Attempts
  ↓
Submission
  ↓
Evaluation
  ↓
Result
  ↓
Report
```

---

# 13. Assessment Problem Management

An assessment can contain multiple problems.

Each problem should have:

```text
Assessment ID
Problem ID
Question Order
Marks
Is Required
```

Example:

```text
Assessment: Backend Developer Test

1. JavaScript MCQ       10 Marks
2. SQL Question         20 Marks
3. Two Sum              20 Marks
4. REST API Question    10 Marks
```

The system should support:

* Add problem
* Remove problem
* Reorder problem
* Set marks
* Set required/optional

---

# 14. Assessment Settings

Each assessment may have configurable rules.

### Settings

```text
Duration
Maximum Attempts
Shuffle Questions
Shuffle MCQ Options
Allow Multiple Attempts
Prevent Copy/Paste
Require Fullscreen
```

Example:

```text
Duration: 60 minutes
Maximum Attempts: 1
Shuffle Questions: Yes
Shuffle Options: Yes
Fullscreen Required: Yes
Copy/Paste: Disabled
```

---

# 15. Candidate Invitation

Companies can invite candidates to assessments.

### Invitation Information

```text
Assessment
Candidate
Email
Invitation Token
Status
Expiration Date
Invitation Date
```

### Invitation Status

```text
PENDING
ACCEPTED
DECLINED
EXPIRED
```

### Invitation Flow

```text
Company
   ↓
Select Assessment
   ↓
Select Candidate
   ↓
Send Invitation
   ↓
Candidate Receives Email
   ↓
Accept Invitation
   ↓
Start Assessment
```

---

# 16. Assessment Attempt

An attempt represents one candidate's participation in an assessment.

### Attempt Information

```text
Candidate
Assessment
Attempt Number
Status
Started At
Submitted At
Expires At
Total Marks
Obtained Marks
Percentage
```

### Attempt Status

```text
NOT_STARTED
IN_PROGRESS
SUBMITTED
EXPIRED
EVALUATED
```

### Attempt Flow

```text
Invitation
    ↓
Accept
    ↓
Start Assessment
    ↓
Create Attempt
    ↓
Start Timer
    ↓
Answer Questions
    ↓
Submit
    ↓
Evaluation
```

---

# 17. Timer Management

The assessment must support a server-controlled timer.

### Requirements

* Timer starts when the attempt starts
* Server stores `startedAt`
* Server stores `expiresAt`
* Frontend displays remaining time
* Backend validates expiration
* Expired attempts cannot accept new submissions
* Automatic submission may occur when time expires

The backend must be the final authority for assessment timing.

---

# 18. Submission Management

Every candidate answer should be stored as a submission.

### Submission Types

```text
MCQ
WRITTEN
CODING
```

### Submission Information

```text
Attempt
Candidate
Problem
Answer
Source Code
Language
Status
Submitted At
Execution Time
Memory Usage
```

### Submission Status

```text
PENDING
RUNNING
PASSED
FAILED
ERROR
EVALUATED
```

---

# 19. Evaluation System

The platform should support both automatic and manual evaluation.

### Automatic Evaluation

Used for:

```text
MCQ
Coding
```

### Manual Evaluation

Used mainly for:

```text
Written Questions
```

### Evaluation Information

```text
Submission
Evaluator
Marks
Feedback
Status
Evaluated At
```

### Evaluation Status

```text
PENDING
IN_PROGRESS
COMPLETED
```

---

# 20. Result Management

After evaluation, the system generates a final result.

### Result Information

```text
Total Marks
Obtained Marks
Percentage
Pass/Fail
Rank
```

Example:

```text
Total Marks: 100
Obtained Marks: 82
Percentage: 82%
Status: PASSED
Rank: 5
```

Candidates should be able to view their own results.

Companies should be able to view results of candidates participating in their assessments.

---

# 21. Anti-Cheating System

The platform should monitor suspicious candidate activity.

### Events

```text
TAB_SWITCH
COPY
PASTE
FULLSCREEN_EXIT
MULTIPLE_TAB
WINDOW_BLUR
```

### Anti-Cheat Flow

```text
Browser
   ↓
Detect Event
   ↓
Send Event to API
   ↓
Store AntiCheatEvent
   ↓
Analyze Activity
   ↓
Show Risk Information
```

The system should not automatically mark a candidate as cheating based solely on one event. Events should be treated as signals for review.

---

# 22. Analytics

Companies should have access to assessment analytics.

### Assessment Analytics

```text
Total Candidates
Invited Candidates
Started Candidates
Completed Candidates
Passed Candidates
Failed Candidates
Average Score
Highest Score
Lowest Score
Completion Rate
Pass Rate
```

### Candidate Analytics

```text
Overall Score
Question-wise Score
Coding Performance
MCQ Performance
Written Performance
Time Used
Anti-Cheat Events
```

---

# 23. Assessment Report

The system should generate a company report after an assessment.

### Report

```text
Assessment Information
Candidate Statistics
Score Distribution
Average Score
Highest Score
Lowest Score
Pass Rate
Completion Rate
Candidate Ranking
Question Performance
Anti-Cheat Statistics
```

---

# 24. Assessment History

The system should maintain historical assessment data.

Candidates can view:

```text
Assessment Name
Company
Attempt Date
Score
Percentage
Result
```

Companies can view:

```text
Assessment
Created Date
Number of Candidates
Average Score
Status
```

---

# 25. Notification System

The platform should support notifications.

### Email Notifications

* Assessment invitation
* Invitation accepted
* Assessment reminder
* Assessment completion
* Result published
* Password reset
* Email verification

### In-App Notifications

* New invitation
* Assessment deadline
* Result available
* Evaluation completed

---

# 26. API Requirements

The backend should follow REST API architecture.

### Authentication

```http
POST /api/v1/auth/register
POST /api/v1/auth/login
POST /api/v1/auth/refresh-token
POST /api/v1/auth/logout
GET  /api/v1/auth/me
```

### Companies

```http
POST   /api/v1/companies
GET    /api/v1/companies/:id
PATCH  /api/v1/companies/:id
DELETE /api/v1/companies/:id
```

### Company Members

```http
POST   /api/v1/companies/:id/members
GET    /api/v1/companies/:id/members
PATCH  /api/v1/company-members/:id
DELETE /api/v1/company-members/:id
```

### Problems

```http
POST   /api/v1/problems
GET    /api/v1/problems
GET    /api/v1/problems/:id
PATCH  /api/v1/problems/:id
DELETE /api/v1/problems/:id
```

### Assessments

```http
POST   /api/v1/assessments
GET    /api/v1/assessments
GET    /api/v1/assessments/:id
PATCH  /api/v1/assessments/:id
DELETE /api/v1/assessments/:id
POST   /api/v1/assessments/:id/publish
```

### Invitations

```http
POST /api/v1/assessments/:id/invitations
GET  /api/v1/invitations
POST /api/v1/invitations/:token/accept
```

### Attempts

```http
POST /api/v1/assessments/:id/start
GET  /api/v1/attempts/:id
POST /api/v1/attempts/:id/submit
```

### Submissions

```http
POST /api/v1/attempts/:id/submissions
GET  /api/v1/submissions/:id
```

### Evaluation

```http
GET   /api/v1/evaluations
POST  /api/v1/submissions/:id/evaluate
PATCH /api/v1/evaluations/:id
```

### Results

```http
GET /api/v1/attempts/:id/result
GET /api/v1/assessments/:id/results
```

### Reports

```http
GET /api/v1/assessments/:id/report
```

---

# 27. Authorization Requirements

The system must implement role-based and resource-based authorization.

Examples:

### Candidate

Can:

```text
View own profile
View own invitations
Attempt assigned assessments
Submit answers
View own results
```

Cannot:

```text
Edit company assessments
View other candidates' submissions
Access problem solutions
Modify evaluation
```

### Assessment Creator

Can:

```text
Create assessments
Manage assessment problems
Publish assessments
Invite candidates
```

### Evaluator

Can:

```text
View assigned submissions
Evaluate submissions
Provide feedback
```

### Company Admin

Can:

```text
Manage company
Manage members
Manage assessments
View reports
```

### Super Admin

Can:

```text
Manage entire platform
Manage users
Manage companies
Manage system resources
```

---

# 28. Security Requirements

The platform must implement:

* Password hashing using bcrypt/bcryptjs
* JWT authentication
* Refresh token rotation
* Input validation using Zod
* SQL injection protection through Prisma
* Rate limiting
* CORS configuration
* Helmet/security headers
* Request size limits
* Authentication middleware
* Authorization middleware
* Secure HTTP-only cookies where applicable
* Environment variable protection
* Audit logging
* Secure file upload validation

### Coding Security

Untrusted code must run inside an isolated sandbox.

Never execute candidate code directly inside the main API server.

---

# 29. Performance Requirements

The system should support:

* Pagination
* Database indexing
* Efficient Prisma queries
* Redis caching where appropriate
* Background jobs
* Queue-based code execution
* Rate limiting
* Database connection pooling

Heavy operations such as code execution, email delivery, and report generation should preferably run asynchronously.

---

# 30. Recommended Technology Stack

## Backend

```text
Node.js
TypeScript
Express.js
```

## Database

```text
PostgreSQL
Prisma ORM
```

## Authentication

```text
JWT
bcrypt/bcryptjs
```

## Validation

```text
Zod
```

## Cache / Queue

```text
Redis
BullMQ
```

## File Storage

```text
Cloudinary / S3-compatible storage
```

## Email

```text
Nodemailer
```

## Code Execution

```text
Isolated Docker-based worker
```

or another secure code execution service.

## Frontend

```text
Next.js
React
TypeScript
Tailwind CSS
shadcn/ui
TanStack Query
```

---

# 31. Database Models

The initial database should contain:

```text
User
CandidateProfile
Company
CompanyMember

Problem
MCQQuestion
MCQOption
WrittenQuestion
CodingQuestion
TestCase

Assessment
AssessmentProblem
AssessmentSetting

AssessmentInvitation
AssessmentAttempt

Submission
Evaluation
Result

AntiCheatEvent
AssessmentReport
```

---

# 32. Main Database Relationship

```text
User
 ├── CandidateProfile
 └── CompanyMember
        │
        ▼
     Company
        │
        ▼
   Assessment
        │
        ├── AssessmentProblem
        │       │
        │       ▼
        │     Problem
        │
        ├── AssessmentInvitation
        │       │
        │       ▼
        │    Candidate
        │
        └── AssessmentAttempt
                 │
                 ├── AntiCheatEvent
                 │
                 └── Submission
                         │
                         ▼
                     Evaluation
                         │
                         ▼
                       Result
                         │
                         ▼
                 AssessmentReport
```

---

# 33. Assessment Workflow

```text
Company
   ↓
Create Assessment
   ↓
Add Problems
   ↓
Configure Assessment
   ↓
Publish
   ↓
Invite Candidates
   ↓
Candidate Accepts Invitation
   ↓
Start Assessment
   ↓
Attempt Created
   ↓
Timer Starts
   ↓
Candidate Answers Questions
   ↓
Submit Answers
   ↓
Automatic / Manual Evaluation
   ↓
Calculate Score
   ↓
Generate Result
   ↓
Generate Company Report
```

---

# 34. Development Phases

## Phase 1 — Foundation

```text
Project Setup
Database
Prisma
Environment Configuration
Error Handling
API Structure
```

## Phase 2 — Authentication

```text
Registration
Login
JWT
Refresh Token
Authorization
Roles
```

## Phase 3 — User & Company

```text
Candidate Profile
Company
Company Members
Member Roles
```

## Phase 4 — Problem Bank

```text
Problem CRUD
MCQ
Written
Coding
Test Cases
```

## Phase 5 — Assessment

```text
Assessment CRUD
Assessment Problems
Assessment Settings
Publish Assessment
```

## Phase 6 — Invitation

```text
Candidate Invitation
Email Notification
Invitation Acceptance
```

## Phase 7 — Attempt

```text
Start Assessment
Timer
Save Answers
Submit Assessment
```

## Phase 8 — Evaluation

```text
MCQ Auto Evaluation
Coding Evaluation
Written Manual Evaluation
```

## Phase 9 — Result

```text
Score
Percentage
Pass/Fail
Ranking
Result History
```

## Phase 10 — Advanced Features

```text
Anti-Cheat
Analytics
Reports
Notifications
Audit Logs
Code Execution Worker
```

---

# 35. Non-Functional Requirements

### Scalability

The architecture should allow horizontal scaling of API servers and execution workers.

### Reliability

The system should prevent data loss during:

* Network failure
* Candidate refresh
* Server restart
* Submission retry

### Maintainability

The backend should follow:

```text
Modular Architecture
Service Layer
Controller Layer
Repository/Data Access
Validation
Centralized Error Handling
```

### Observability

The system should provide:

```text
Application Logs
Error Logs
Audit Logs
Performance Monitoring
Background Job Monitoring
```

---

# 36. MVP Scope

The first version should focus on:

```text
Authentication
        ↓
Company Management
        ↓
Candidate Management
        ↓
Problem Bank
        ↓
Assessment Creation
        ↓
Candidate Invitation
        ↓
Timed Attempt
        ↓
MCQ / Written / Coding Submission
        ↓
Evaluation
        ↓
Result
        ↓
Basic Company Report
```

Advanced features such as sophisticated anti-cheating, distributed code execution, advanced analytics, and recommendation systems can be implemented in later versions.

---

# 37. Success Criteria

The project will be considered successful when:

* Companies can create assessments.
* Problems can be reused across assessments.
* Candidates can receive and accept invitations.
* Candidates can complete timed assessments.
* MCQ questions can be automatically evaluated.
* Coding submissions can be securely executed.
* Written answers can be manually evaluated.
* Final scores can be generated automatically.
* Companies can view candidate results.
* Assessment reports can be generated.
* User permissions are enforced.
* Candidate code cannot compromise the main application server.
* The system can handle multiple concurrent assessment attempts securely.
